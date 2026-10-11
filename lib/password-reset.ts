import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Stateless password links, signed with NEXTAUTH_SECRET.
 *
 * A token names the user and the authVersion it was issued against. Changing
 * the password bumps authVersion (database trigger "User_sync_identity_security"),
 * so a link stops working the moment it is used — or the moment the password
 * changes any other way — with no token table to clean up.
 *
 * "reset" links come from Forgot password and last an hour; "setup" links go to
 * newly approved accounts so nobody has to pass a temporary password around.
 */

export type PasswordLinkPurpose = 'reset' | 'setup'

export const LINK_LIFETIME_MS: Record<PasswordLinkPurpose, number> = {
  reset: 60 * 60 * 1000,
  setup: 7 * 24 * 60 * 60 * 1000,
}

interface Payload {
  u: string // user id
  v: number // authVersion when issued
  p: PasswordLinkPurpose
  e: number // expiry, ms since epoch
}

export type VerifyResult =
  | { ok: true; userId: string; authVersion: number; purpose: PasswordLinkPurpose }
  | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' }

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET
  if (!value) throw new Error('NEXTAUTH_SECRET is required to sign password links')
  return value
}

const sign = (data: string) => createHmac('sha256', secret()).update(`password-link:${data}`).digest('base64url')

export function createPasswordToken(
  user: { id: string; authVersion: number },
  purpose: PasswordLinkPurpose,
  now = Date.now()
): string {
  const payload: Payload = { u: user.id, v: user.authVersion, p: purpose, e: now + LINK_LIFETIME_MS[purpose] }
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifyPasswordToken(token: string, now = Date.now()): VerifyResult {
  const [data, signature, extra] = (token ?? '').split('.')
  if (!data || !signature || extra !== undefined) return { ok: false, reason: 'malformed' }

  const expected = Buffer.from(sign(data))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'bad-signature' }
  }

  let payload: Payload
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Payload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof payload.u !== 'string' || typeof payload.v !== 'number' || typeof payload.e !== 'number' || (payload.p !== 'reset' && payload.p !== 'setup')) {
    return { ok: false, reason: 'malformed' }
  }
  if (now > payload.e) return { ok: false, reason: 'expired' }
  return { ok: true, userId: payload.u, authVersion: payload.v, purpose: payload.p }
}

export function passwordLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`
}

export const MIN_PASSWORD_LENGTH = 8
