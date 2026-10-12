import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), session: vi.fn(), findUser: vi.fn(), transaction: vi.fn(),
  deleteUser: vi.fn(), compare: vi.fn(), audit: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.findUser }, $transaction: mocks.transaction } }))
vi.mock('@/lib/user-deletion', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/user-deletion')>()),
  deleteUserWithRelations: mocks.deleteUser,
}))

import { POST } from '@/app/api/account/delete/route'
import { UserDeletionConflictError } from '@/lib/user-deletion'

const post = (body: unknown) => new Request('https://example.test/api/account/delete', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.auth.mockResolvedValue({ id: 'parent-1', role: UserRole.PARENT })
  mocks.session.mockResolvedValue({ user: { id: 'parent-1' } })
  mocks.findUser.mockResolvedValue({ id: 'parent-1', password: 'hash' })
  mocks.compare.mockResolvedValue(true)
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({ tx: true }))
})

describe('POST /api/account/delete', () => {
  it('deletes the signed-in person with the same routine an administrator uses (happy path)', async () => {
    const response = await POST(post({ password: 'correct horse' }))
    expect(response.status).toBe(200)
    expect(mocks.deleteUser).toHaveBeenCalledWith({ tx: true }, 'parent-1')
    expect(mocks.compare).toHaveBeenCalledWith('correct horse', 'hash')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'account.self_delete', entityId: 'parent-1', actorUserId: null,
      metadata: { role: UserRole.PARENT },
    }))
  })

  it('only ever deletes the account of the session, whatever the body names (highest-risk path)', async () => {
    await POST(post({ password: 'pw', userId: 'someone-else', id: 'someone-else' }))
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1)
    expect(mocks.deleteUser).toHaveBeenCalledWith(expect.anything(), 'parent-1')
  })

  it('requires the current password and rejects a wrong one without deleting (highest-risk path)', async () => {
    const missing = await POST(post({}))
    expect(missing.status).toBe(400)
    mocks.compare.mockResolvedValue(false)
    const wrong = await POST(post({ password: 'nope' }))
    // 403 rather than 401, so the native client doesn't read a typo as an expired session.
    expect(wrong.status).toBe(403)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ result: 'DENIED', reason: 'PASSWORD_INCORRECT' }))
  })

  it('is read-only under View As, so an admin can never delete the person they are viewing (highest-risk path)', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'parent-1' }, impersonating: { originalId: 'admin-1' } })
    const response = await POST(post({ password: 'pw' }))
    expect(response.status).toBe(403)
    expect((await response.json()).error).toBe('ViewAsReadOnly')
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it("won't let a super administrator remove their own account", async () => {
    mocks.auth.mockResolvedValue({ id: 'admin-1', role: UserRole.SUPER_ADMIN })
    const response = await POST(post({ password: 'pw' }))
    expect(response.status).toBe(403)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('explains records the church must keep instead of reporting success (highest-risk path)', async () => {
    mocks.deleteUser.mockRejectedValue(new UserDeletionConflictError(
      'This user cannot be deleted because they have confidential priest notes. Disable the account instead to preserve this history.',
    ))
    const response = await POST(post({ password: 'pw' }))
    expect(response.status).toBe(409)
    const body = await response.json()
    expect(body.error).toContain('confidential priest notes')
    expect(body.error).toContain('Contact an administrator')
    expect(mocks.audit).not.toHaveBeenCalledWith(expect.objectContaining({ result: 'SUCCESS' }))
  })

  it('requires a signed-in session', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    const response = await POST(post({ password: 'pw' }))
    expect(response.status).toBe(401)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })
})
