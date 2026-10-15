// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({
  prisma: {
    passkeyChallenge: { findFirst: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    passkey: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { findUnique: vi.fn() }, $transaction: vi.fn(),
  },
  verifyAuthenticationResponse: vi.fn(), verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(), generateRegistrationOptions: vi.fn(), checkRateLimit: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@simplewebauthn/server', () => ({
  verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
  verifyRegistrationResponse: mocks.verifyRegistrationResponse,
  generateAuthenticationOptions: mocks.generateAuthenticationOptions,
  generateRegistrationOptions: mocks.generateRegistrationOptions,
}))

import { authenticatePasskey, consumePasskeyChallenge, registerPasskey, registrationOptions, passkeyTokenFromHeader } from '@/lib/passkeys'
import { assertPasskeyOrigin, assertRecentPasskeyLogin, getPasskeyConfig } from '@/lib/passkey-config'

const token = 'a'.repeat(43)
const user = { id: 'user-1', authVersion: 3, email: 'person@example.test', name: 'Person', isDisabled: false, mustChangePassword: false }
const response = { id: 'credential-1', response: { userHandle: Buffer.from(user.id).toString('base64url') } }
const key = { id: 'key-1', userId: user.id, rpID: 'example.test', credentialId: response.id, publicKey: 'a2V5', counter: BigInt(4), transports: ['internal'], user }

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PASSKEY_RP_ID', 'example.test')
  vi.stubEnv('PASSKEY_ORIGIN', 'https://app.example.test')
  mocks.prisma.passkeyChallenge.findFirst.mockResolvedValue({ challenge: 'challenge-1', purpose: 'authenticate', userId: user.id, authVersion: user.authVersion })
  mocks.prisma.passkeyChallenge.deleteMany.mockResolvedValue({ count: 1 })
  mocks.prisma.passkey.findUnique.mockResolvedValue(key)
  mocks.prisma.passkey.findMany.mockResolvedValue([])
  mocks.prisma.passkey.updateMany.mockResolvedValue({ count: 1 })
  mocks.prisma.passkey.count.mockResolvedValue(0)
  mocks.prisma.user.findUnique.mockResolvedValue(user)
  mocks.prisma.$transaction.mockImplementation(async callback => callback(mocks.prisma))
  mocks.checkRateLimit.mockResolvedValue({ allowed: true })
  mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 5, credentialBackedUp: true } })
  mocks.verifyRegistrationResponse.mockResolvedValue({ verified: true, registrationInfo: { credential: { id: 'new-key', publicKey: new Uint8Array([1, 2]), counter: 0 }, credentialDeviceType: 'multiDevice', credentialBackedUp: true } })
})

describe('passkey configuration', () => {
  it('accepts a parent RP domain and uses host-only secure cookie names', () => {
    expect(getPasskeyConfig()).toEqual({ rpID: 'example.test', origin: 'https://app.example.test', secure: true })
    expect(passkeyTokenFromHeader(`other=1; __Host-passkey-authenticate=${token}`, 'authenticate')).toBe(token)
  })
  it.each(['https://evil.test', 'https://example.test.evil.test', 'https://app.example.test/path', 'http://app.example.test', 'https://app.example.test/'])('rejects unsafe or noncanonical origin %s', origin => {
    vi.stubEnv('PASSKEY_ORIGIN', origin)
    expect(() => getPasskeyConfig()).toThrow()
  })
  it('requires explicit configuration and exact request origins', () => {
    expect(() => assertPasskeyOrigin('https://evil.test')).toThrow('Forbidden')
    expect(() => assertPasskeyOrigin(undefined)).toThrow('Forbidden')
    vi.stubEnv('PASSKEY_RP_ID', '')
    expect(() => getPasskeyConfig()).toThrow('not enabled')
  })
  it('accepts localhost for development', () => {
    vi.stubEnv('PASSKEY_RP_ID', 'localhost')
    vi.stubEnv('PASSKEY_ORIGIN', 'http://localhost:3000')
    expect(getPasskeyConfig().secure).toBe(false)
  })
  it('requires a recent real sign-in and rejects missing/future timestamps', () => {
    expect(() => assertRecentPasskeyLogin(Date.now())).not.toThrow()
    for (const at of [undefined, Date.now() - 600_001, Date.now() + 10_000]) expect(() => assertRecentPasskeyLogin(at)).toThrow('sign out and sign in again')
  })
})

describe('one-time challenges', () => {
  it('looks up only a hashed token with the correct purpose and expiry', async () => {
    await consumePasskeyChallenge(token, 'authenticate')
    expect(mocks.prisma.passkeyChallenge.findFirst).toHaveBeenCalledWith({ where: {
      tokenHash: createHash('sha256').update(token).digest('hex'), purpose: 'authenticate', expiresAt: { gt: expect.any(Date) },
    } })
  })
  it('rejects expired challenges and requests that lose a replay race', async () => {
    mocks.prisma.passkeyChallenge.findFirst.mockResolvedValueOnce(null)
    await expect(consumePasskeyChallenge(token, 'authenticate')).rejects.toThrow('expired')
    mocks.prisma.passkeyChallenge.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(consumePasskeyChallenge(token, 'authenticate')).rejects.toThrow('expired')
  })
  it('rejects absent/malformed tokens without querying storage', async () => {
    for (const value of [undefined, '', 'bad']) await expect(consumePasskeyChallenge(value, 'register')).rejects.toThrow()
    expect(mocks.prisma.passkeyChallenge.findFirst).not.toHaveBeenCalled()
  })
})

describe('passkey sign-in', () => {
  it('requires signature, origin, RP ID, challenge and user verification, then advances the counter', async () => {
    await expect(authenticatePasskey(token, JSON.stringify(response))).resolves.toEqual(user)
    expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
      expectedOrigin: 'https://app.example.test', expectedRPID: 'example.test', expectedChallenge: 'challenge-1', requireUserVerification: true,
      credential: expect.objectContaining({ counter: 4 }),
    }))
    expect(mocks.prisma.passkey.updateMany).toHaveBeenCalledWith({ where: { id: 'key-1', counter: BigInt(4) }, data: { counter: BigInt(5), backedUp: true, lastUsedAt: expect.any(Date) } })
  })
  it.each(['unknown', 'disabled', 'wrong-rp', 'wrong-user-handle', 'revoked', 'changed-version', 'invalid-signature', 'counter-race', 'rate-limited'])('rejects %s', async scenario => {
    if (scenario === 'unknown') mocks.prisma.passkey.findUnique.mockResolvedValue(null)
    if (scenario === 'disabled') mocks.prisma.passkey.findUnique.mockResolvedValue({ ...key, user: { ...user, isDisabled: true } })
    if (scenario === 'wrong-rp') mocks.prisma.passkey.findUnique.mockResolvedValue({ ...key, rpID: 'other.test' })
    if (scenario === 'wrong-user-handle') mocks.prisma.passkey.findUnique.mockResolvedValue({ ...key, userId: 'other-user' })
    if (scenario === 'revoked' || scenario === 'counter-race') mocks.prisma.passkey.updateMany.mockResolvedValue({ count: 0 })
    if (scenario === 'changed-version') mocks.prisma.user.findUnique.mockResolvedValue({ ...user, authVersion: 4 })
    if (scenario === 'invalid-signature') mocks.verifyAuthenticationResponse.mockRejectedValue(new Error('Invalid signature'))
    if (scenario === 'rate-limited') mocks.checkRateLimit.mockResolvedValue({ allowed: false })
    await expect(authenticatePasskey(token, JSON.stringify(response))).rejects.toThrow()
  })
  it('preserves the password-change gate for existing credentials', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...user, mustChangePassword: true })
    expect((await authenticatePasskey(token, JSON.stringify(response))).mustChangePassword).toBe(true)
  })
  it('rejects malformed input before credential lookup', async () => {
    for (const input of ['null', '{}', 'bad json', 'x'.repeat(32_769)]) await expect(authenticatePasskey(token, input)).rejects.toThrow()
    expect(mocks.prisma.passkey.findUnique).not.toHaveBeenCalled()
  })
})

describe('passkey registration', () => {
  it('requires discoverable credentials and user verification', async () => {
    mocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'new-challenge' })
    await registrationOptions(user)
    expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
      attestationType: 'none', userID: new TextEncoder().encode(user.id), authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    }))
  })
  it('stores verified public credential data', async () => {
    await registerPasskey(user, token, {} as never, 'My phone')
    expect(mocks.verifyRegistrationResponse).toHaveBeenCalledWith(expect.objectContaining({ requireUserVerification: true, expectedOrigin: 'https://app.example.test', expectedRPID: 'example.test' }))
    expect(mocks.prisma.passkey.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: user.id, credentialId: 'new-key', name: 'My phone', publicKey: 'AQI', counter: BigInt(0) }) })
  })
  it.each(['wrong-owner', 'old-version', 'disabled', 'must-change-password', 'bad-attestation'])('rejects %s enrollment', async scenario => {
    if (scenario === 'wrong-owner') mocks.prisma.passkeyChallenge.findFirst.mockResolvedValue({ userId: 'other', authVersion: 3 })
    if (scenario === 'old-version') mocks.prisma.passkeyChallenge.findFirst.mockResolvedValue({ userId: user.id, authVersion: 2 })
    if (scenario === 'disabled') mocks.prisma.user.findUnique.mockResolvedValue({ ...user, isDisabled: true })
    if (scenario === 'must-change-password') mocks.prisma.user.findUnique.mockResolvedValue({ ...user, mustChangePassword: true })
    if (scenario === 'bad-attestation') mocks.verifyRegistrationResponse.mockRejectedValue(new Error('Invalid attestation'))
    await expect(registerPasskey(user, token, {} as never, 'My phone')).rejects.toThrow()
    expect(mocks.prisma.passkey.create).not.toHaveBeenCalled()
  })
})
