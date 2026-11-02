import { createHash, randomBytes } from 'node:crypto'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { expectedPasskeyOrigins, getPasskeyConfig, PasskeyError } from '@/lib/passkey-config'

export const PASSKEY_CHALLENGE_SECONDS = 300
type Purpose = 'register' | 'authenticate'
export const passkeyCookieName = (purpose: Purpose) => `${getPasskeyConfig().secure ? '__Host-' : ''}passkey-${purpose}`
export function passkeyTokenFromHeader(header: string | undefined, purpose: Purpose) {
  const prefix = `${passkeyCookieName(purpose)}=`
  return header?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length)
}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export async function limitPasskeyRequests(key: string, max = 30) {
  const result = await checkRateLimit(`passkey:${key}`, max, 15 * 60 * 1000)
  if (!result.allowed) throw new PasskeyError('Too many attempts. Please try again later.', 429)
}

async function saveChallenge(challenge: string, purpose: Purpose, user?: { id: string; authVersion: number }) {
  const token = randomBytes(32).toString('base64url')
  // Bound storage: expired challenges are removed on each options request.
  await prisma.passkeyChallenge.deleteMany({ where: { expiresAt: { lte: new Date() } } })
  await prisma.passkeyChallenge.create({ data: {
    tokenHash: tokenHash(token), challenge, purpose,
    userId: user?.id, authVersion: user?.authVersion,
    expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_SECONDS * 1000),
  } })
  return token
}

export async function consumePasskeyChallenge(token: string | undefined, purpose: Purpose) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PasskeyError('Passkey request expired. Please try again.')
  const where = { tokenHash: tokenHash(token), purpose, expiresAt: { gt: new Date() } }
  const challenge = await prisma.passkeyChallenge.findFirst({ where })
  if (!challenge) throw new PasskeyError('Passkey request expired. Please try again.')
  // Atomic deletion makes replay fail across concurrent requests/server instances.
  const consumed = await prisma.passkeyChallenge.deleteMany({ where })
  if (consumed.count !== 1) throw new PasskeyError('Passkey request expired. Please try again.')
  return challenge
}

export async function registrationOptions(user: { id: string; email: string; name: string; authVersion: number }) {
  const { rpID } = getPasskeyConfig()
  const existing = await prisma.passkey.findMany({ where: { userId: user.id, rpID } })
  if (existing.length >= 10) throw new PasskeyError('Remove an existing passkey before adding another.')
  const options = await generateRegistrationOptions({
    rpName: 'St. Mark Ministry', rpID,
    userID: new TextEncoder().encode(user.id), userName: user.email, userDisplayName: user.name,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: existing.map(key => ({ id: key.credentialId, transports: key.transports as AuthenticatorTransportFuture[] })),
  })
  return { options, token: await saveChallenge(options.challenge, 'register', user) }
}

export async function authenticationOptions() {
  const options = await generateAuthenticationOptions({ rpID: getPasskeyConfig().rpID, userVerification: 'required' })
  return { options, token: await saveChallenge(options.challenge, 'authenticate') }
}

export async function registerPasskey(user: { id: string; authVersion: number }, token: string | undefined, response: RegistrationResponseJSON, name: string) {
  const { rpID } = getPasskeyConfig()
  const challenge = await consumePasskeyChallenge(token, 'register')
  if (challenge.userId !== user.id || challenge.authVersion !== user.authVersion) throw new PasskeyError('Passkey request expired. Please try again.')
  let result
  try {
    result = await verifyRegistrationResponse({ response, expectedChallenge: challenge.challenge, expectedOrigin: expectedPasskeyOrigins(), expectedRPID: rpID, requireUserVerification: true })
  } catch { throw new PasskeyError('Could not verify this passkey. Please try again.') }
  if (!result.verified || !result.registrationInfo) throw new PasskeyError('Could not verify this passkey.')
  const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo
  // Recheck the account inside the transaction before saving a new login method.
  await prisma.$transaction(async tx => {
    const current = await tx.user.findUnique({ where: { id: user.id } })
    if (!current || current.isDisabled || current.mustChangePassword || current.authVersion !== user.authVersion) throw new PasskeyError('Unauthorized', 401)
    if (await tx.passkey.count({ where: { userId: user.id, rpID } }) >= 10) throw new PasskeyError('Passkey limit reached.')
    await tx.passkey.create({ data: {
      userId: user.id, rpID, name, credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: BigInt(credential.counter),
      transports: credential.transports ?? [], deviceType: credentialDeviceType, backedUp: credentialBackedUp,
    } })
  })
}

// Called only inside NextAuth's CSRF-protected Credentials callback. A verified
// assertion becomes an ordinary NextAuth session; no parallel session cookies.
export async function authenticatePasskey(token: string | undefined, responseJSON: string) {
  const { rpID } = getPasskeyConfig()
  if (responseJSON.length > 32_768) throw new PasskeyError('Invalid passkey response.')
  let response: AuthenticationResponseJSON
  try { response = JSON.parse(responseJSON) } catch { throw new PasskeyError('Invalid passkey response.') }
  if (!response || typeof response.id !== 'string' || response.id.length > 2048) throw new PasskeyError('Invalid passkey response.')
  const challenge = await consumePasskeyChallenge(token, 'authenticate')
  await limitPasskeyRequests(`credential:${tokenHash(response.id)}`, 10)
  const key = await prisma.passkey.findUnique({ where: { credentialId: response.id }, include: { user: true } })
  if (!key || key.rpID !== rpID || key.user.isDisabled) throw new PasskeyError('Unable to sign in with this passkey.')
  if (response.response?.userHandle !== Buffer.from(key.userId).toString('base64url')) throw new PasskeyError('Unable to sign in with this passkey.')
  let result
  try {
    result = await verifyAuthenticationResponse({
      response, expectedChallenge: challenge.challenge, expectedOrigin: expectedPasskeyOrigins(), expectedRPID: rpID, requireUserVerification: true,
      credential: { id: key.credentialId, publicKey: new Uint8Array(Buffer.from(key.publicKey, 'base64url')), counter: Number(key.counter), transports: key.transports as AuthenticatorTransportFuture[] },
    })
  } catch { throw new PasskeyError('Unable to sign in with this passkey.') }
  if (!result.verified) throw new PasskeyError('Unable to sign in with this passkey.')
  const updated = await prisma.passkey.updateMany({
    where: { id: key.id, counter: key.counter },
    data: { counter: BigInt(result.authenticationInfo.newCounter), backedUp: result.authenticationInfo.credentialBackedUp, lastUsedAt: new Date() },
  })
  if (updated.count !== 1) throw new PasskeyError('Unable to sign in with this passkey.')
  const user = await prisma.user.findUnique({ where: { id: key.userId } })
  if (!user || user.isDisabled || user.authVersion !== key.user.authVersion) throw new PasskeyError('Unable to sign in with this passkey.')
  return user
}
