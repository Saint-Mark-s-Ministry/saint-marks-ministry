import { beforeAll, describe, expect, it } from 'vitest'
import { createPasswordToken, LINK_LIFETIME_MS, passwordLinkUrl, verifyPasswordToken } from '@/lib/password-reset'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET ||= 'test-secret'
})

const user = { id: 'user_1', authVersion: 3 }

describe('password link tokens', () => {
  it('round-trips the user, authVersion and purpose', () => {
    const token = createPasswordToken(user, 'reset', 1_000)
    expect(verifyPasswordToken(token, 1_000)).toEqual({ ok: true, userId: 'user_1', authVersion: 3, purpose: 'reset' })
  })

  it('expires after the purpose lifetime', () => {
    const token = createPasswordToken(user, 'reset', 0)
    expect(verifyPasswordToken(token, LINK_LIFETIME_MS.reset).ok).toBe(true)
    expect(verifyPasswordToken(token, LINK_LIFETIME_MS.reset + 1)).toEqual({ ok: false, reason: 'expired' })
    expect(verifyPasswordToken(createPasswordToken(user, 'setup', 0), LINK_LIFETIME_MS.reset + 1).ok).toBe(true)
  })

  it('rejects a payload edited to another user', () => {
    const [, signature] = createPasswordToken(user, 'reset').split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'admin', v: 3, p: 'reset', e: Date.now() + 60_000 })).toString('base64url')
    expect(verifyPasswordToken(`${forged}.${signature}`)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects malformed input', () => {
    for (const token of ['', 'abc', 'a.b.c', undefined as unknown as string]) {
      expect(verifyPasswordToken(token).ok).toBe(false)
    }
  })

  it('builds a URL-safe link', () => {
    expect(passwordLinkUrl('https://stmarkministry.app', 'a+b')).toBe('https://stmarkministry.app/reset-password?token=a%2Bb')
  })
})
