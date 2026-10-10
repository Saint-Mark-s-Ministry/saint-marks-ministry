import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findUnique: vi.fn(),
  checkRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  emailPasswordReset: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.checkRateLimit }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }))
vi.mock('@/lib/mail/notify', () => ({ emailPasswordReset: mocks.emailPasswordReset }))

import { POST } from '@/app/api/users/[id]/send-password-reset/route'

const account = { id: 'user-2', email: 'user@example.com', name: 'User Two', authVersion: 3, isDisabled: false }
const send = () =>
  POST(new Request('http://localhost/api/users/user-2/send-password-reset', { method: 'POST' }), {
    params: Promise.resolve({ id: 'user-2' }),
  })

describe('POST /api/users/[id]/send-password-reset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.findUnique.mockResolvedValue(account)
    mocks.checkRateLimit.mockResolvedValue({ allowed: true })
  })

  it('emails the reset link and records the activity', async () => {
    const response = await send()

    expect(response.status).toBe(200)
    expect(mocks.emailPasswordReset).toHaveBeenCalledWith(account)
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'admin-1',
      action: 'user.password_reset_email.send',
      entityId: 'user-2',
      result: 'SUCCESS',
    }))
  })

  it.each(['PRIEST', 'SERVANT_PREP', 'MENTOR', 'STUDENT', 'SERVANT'])('forbids %s', async role => {
    mocks.requireAuth.mockResolvedValue({ id: 'other-1', role })
    const response = await send()

    expect(response.status).toBe(403)
    expect(mocks.findUnique).not.toHaveBeenCalled()
    expect(mocks.emailPasswordReset).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown user', async () => {
    mocks.findUnique.mockResolvedValue(null)
    expect((await send()).status).toBe(404)
    expect(mocks.emailPasswordReset).not.toHaveBeenCalled()
  })

  it('refuses disabled accounts', async () => {
    mocks.findUnique.mockResolvedValue({ ...account, isDisabled: true })
    expect((await send()).status).toBe(400)
    expect(mocks.emailPasswordReset).not.toHaveBeenCalled()
  })

  it('rate-limits repeated sends to one user', async () => {
    mocks.checkRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const response = await send()

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('60')
    expect(mocks.emailPasswordReset).not.toHaveBeenCalled()
  })
})
