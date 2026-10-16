import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), context: vi.fn(), target: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
import { PUT } from '@/app/api/admin/users/[id]/view-as-access/route'
import { PATCH } from '@/app/api/users/[id]/route'
const params = { params: Promise.resolve({ id: 'priest' }) }
const request = (body: unknown) => new Request('http://localhost/api/admin/users/priest/view-as-access', { method: 'PUT', body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'admin', role: UserRole.SUPER_ADMIN })
  mocks.session.mockResolvedValue({})
  mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
  mocks.target.mockResolvedValue({ canUseViewAs: false, isDisabled: false, role: UserRole.PRIEST, roleAssignments: [{ tag: RoleTag.PRIEST }] })
  mocks.update.mockResolvedValue({ id: 'priest', canUseViewAs: true })
  mocks.transaction.mockImplementation(work => work({ user: { findUnique: mocks.target, update: mocks.update }, auditEvent: { create: mocks.audit } }))
})
describe('granting View as to priests', () => {
  it.each([true, false])('saves %s and audits the change in the same transaction', async enabled => {
    mocks.target.mockResolvedValue({ canUseViewAs: !enabled, isDisabled: false, role: UserRole.PRIEST, roleAssignments: [{ tag: RoleTag.PRIEST }] })
    expect((await PUT(request({ canUseViewAs: enabled }), params)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { canUseViewAs: enabled } }))
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin', entityId: 'priest', action: enabled ? 'VIEW_AS_ACCESS_GRANTED' : 'VIEW_AS_ACCESS_REVOKED' }) })
  })
  it.each([[], [RoleTag.PRIEST], [RoleTag.SUPER_ADMIN, RoleTag.PRIEST]])('denies non-admin and Priest-tagged grantors: %j', async (...tags) => {
    mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set(tags.flat()) })
    expect((await PUT(request({ canUseViewAs: true }), params)).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects disabled admins and View as writes', async () => {
    mocks.context.mockResolvedValue({ disabled: true, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    expect((await PUT(request({ canUseViewAs: true }), params)).status).toBe(403)
    mocks.session.mockResolvedValue({ impersonating: { originalId: 'admin' } })
    expect((await PUT(request({ canUseViewAs: true }), params)).status).toBe(403)
  })
  it.each([null, {}, [], { canUseViewAs: 'true' }])('rejects malformed permission updates: %j', async body => {
    expect((await PUT(request(body), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it.each([
    { role: UserRole.SERVANT_PREP, isDisabled: false, roleAssignments: [] },
    { role: UserRole.PRIEST, isDisabled: false, roleAssignments: [] },
    { role: UserRole.PRIEST, isDisabled: true, roleAssignments: [{ tag: RoleTag.PRIEST }] },
  ])('requires an active priest target: %j', async target => {
    mocks.target.mockResolvedValue(target)
    expect((await PUT(request({ canUseViewAs: true }), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('rejects permission injection through an ordinary profile update', async () => {
    expect((await PATCH(request({ canUseViewAs: true }), params)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('returns 404 for missing accounts', async () => {
    mocks.target.mockResolvedValue(null)
    expect((await PUT(request({ canUseViewAs: true }), params)).status).toBe(404)
  })
})
