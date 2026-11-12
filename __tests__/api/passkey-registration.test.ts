// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), register: vi.fn(), audit: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user } } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))
vi.mock('@/lib/passkeys', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/passkeys')>(),
  registerPasskey: mocks.register,
  limitPasskeyRequests: vi.fn(),
}))

import { POST } from '@/app/api/passkeys/registration/verify/route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('PASSKEY_RP_ID', 'example.test')
  const user = { id: 'user-1', authVersion: 1, isDisabled: false, mustChangePassword: false }
  mocks.session.mockResolvedValue({ user, authenticatedAt: Date.now() })
  mocks.user.mockResolvedValue(user)
})
afterEach(() => vi.unstubAllEnvs())

describe('passkey registration cookie cleanup', () => {
  it.each(['https://app.example.test', '  https://app.example.test/\n'])(
    'clears the secure host cookie with origin configuration %j', async origin => {
      vi.stubEnv('PASSKEY_ORIGIN', origin)
      const response = await POST(new NextRequest('https://app.example.test/api/passkeys/registration/verify', {
        method: 'POST',
        headers: { origin: 'https://app.example.test', 'content-type': 'application/json', cookie: '__Host-passkey-register=test-token' },
        body: JSON.stringify({ name: 'My device', response: { id: 'credential-1', type: 'public-key', response: {} } }),
      }))
      expect(response.status).toBe(200)
      expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }), 'test-token', expect.any(Object), 'My device')
      expect(response.cookies.get('__Host-passkey-register')).toMatchObject({ value: '', maxAge: 0, secure: true, httpOnly: true, path: '/', sameSite: 'strict' })
      expect(response.headers.get('set-cookie')).toContain('Secure')
    },
  )
})
