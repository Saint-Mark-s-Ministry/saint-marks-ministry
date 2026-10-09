import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  compare: vi.fn(),
  hash: vi.fn(),
  recordAuditEvent: vi.fn(),
  emailPasswordChanged: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: mocks.findUnique, update: mocks.update } },
}))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare, hash: mocks.hash } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }))
vi.mock('@/lib/mail/notify', () => ({ emailPasswordChanged: mocks.emailPasswordChanged }))

import { POST } from '@/app/api/auth/change-password/route'

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('change password API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1', role: 'SERVANT' })
    mocks.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User One', password: 'old-hash' })
    mocks.compare.mockResolvedValue(true)
    mocks.hash.mockResolvedValue('new-hash')
    mocks.update.mockResolvedValue({ id: 'user-1' })
  })

  it('clears the password-change requirement without invalidating the active session', async () => {
    const response = await POST(request({ currentPassword: 'Welcome123!', newPassword: 'NewPassword123!' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.destination).toBe('/dashboard/servants')
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { password: 'new-hash', mustChangePassword: false },
    })
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1',
      action: 'AUTH_PASSWORD_CHANGE',
      result: 'SUCCESS',
    }))
    expect(mocks.emailPasswordChanged).toHaveBeenCalledWith({ email: 'user@example.com', name: 'User One' })
  })

  it('does not send a security warning when replacing a temporary password', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'user-1', email: 'user@example.com', name: 'User One', password: 'old-hash', mustChangePassword: true })

    const response = await POST(request({ currentPassword: 'Temp-Pass-123', newPassword: 'NewPassword123!' }))

    expect(response.status).toBe(200)
    expect(mocks.emailPasswordChanged).not.toHaveBeenCalled()
  })

  it('returns the mentor dashboard for a standalone legacy mentor', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'mentor-1', role: 'MENTOR' })
    mocks.findUnique.mockResolvedValue({ id: 'mentor-1', password: 'old-hash' })

    const response = await POST(request({ currentPassword: 'Welcome123!', newPassword: 'NewPassword123!' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      destination: '/dashboard/mentor',
    })
  })

  it('returns Sunday School for a mentor who serves there without Prep leadership', async () => {
    mocks.requireAuth.mockResolvedValue({
      id: 'mentor-1',
      role: 'MENTOR',
      sundaySchool: { hasAccess: true },
      ministryMembership: { sundaySchoolServant: true, servantsPrepLeader: false },
    })
    mocks.findUnique.mockResolvedValue({ id: 'mentor-1', password: 'old-hash' })

    const response = await POST(request({ currentPassword: 'Welcome123!', newPassword: 'NewPassword123!' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ destination: '/dashboard/servants' })
  })

  it('does not change the password when the current password is wrong', async () => {
    mocks.compare.mockResolvedValue(false)

    const response = await POST(request({ currentPassword: 'wrong-password', newPassword: 'NewPassword123!' }))

    expect(response.status).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.emailPasswordChanged).not.toHaveBeenCalled()
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      result: 'DENIED',
      reason: 'CURRENT_PASSWORD_INCORRECT',
    }))
  })
})
