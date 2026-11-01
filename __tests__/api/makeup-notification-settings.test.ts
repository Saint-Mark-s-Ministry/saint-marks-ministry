import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: vi.fn(), context: vi.fn(), target: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
import { PUT } from '@/app/api/admin/users/[id]/makeup-notifications/route'
import { PATCH } from '@/app/api/users/[id]/route'
const params = { params: Promise.resolve({ id: 'recipient' }) }
const request = (body: unknown) => new Request('http://localhost/api/admin/users/recipient/makeup-notifications', { method: 'PUT', body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'admin' })
  mocks.session.mockResolvedValue({})
  mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
  mocks.target.mockResolvedValue({ makeupExamNotifications: false, isDisabled: false, roleAssignments: [{ tag: RoleTag.SERVANTS_PREP_SERVANT }] })
  mocks.update.mockImplementation(async ({ data }) => ({ id: 'recipient', ...data }))
  mocks.transaction.mockImplementation(work => work({ user: { findUnique: mocks.target, update: mocks.update }, auditEvent: { create: mocks.audit } }))
})
describe('makeup notification recipient administration', () => {
  it.each([true, false])('saves %s with an audit event', async enabled => {
    mocks.target.mockResolvedValue({ makeupExamNotifications: !enabled, isDisabled: false, roleAssignments: [{ tag: RoleTag.PRIEST }] })
    expect((await PUT(request({ makeupExamNotifications: enabled }), params)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'recipient' }, data: { makeupExamNotifications: enabled }, select: { id: true, makeupExamNotifications: true } })
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'admin', entityId: 'recipient', metadata: { previous: !enabled, makeupExamNotifications: enabled } }) })
  })
  it.each([[], [RoleTag.SERVANTS_PREP_SERVANT], [RoleTag.PRIEST], [RoleTag.SUPER_ADMIN, RoleTag.PRIEST]])('denies unauthorized grantors %j', async (...tags) => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set(tags.flat()) })
    expect((await PUT(request({ makeupExamNotifications: true }), params)).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['disabled', 'readOnly', 'impersonating'])('blocks %s actor sessions', async condition => {
    if (condition === 'impersonating') mocks.session.mockResolvedValue({ impersonating: {} })
    else mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SUPER_ADMIN]), [condition]: true })
    expect((await PUT(request({ makeupExamNotifications: true }), params)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it.each([null, {}, [], { makeupExamNotifications: 'true' }])('rejects invalid payload %j', async body => {
    expect((await PUT(request(body), params)).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each([RoleTag.SERVANTS_PREP_STUDENT, RoleTag.PARENT, RoleTag.SUNDAY_SCHOOL_SERVANT])('cannot subscribe a non-Prep-staff recipient %s', async tag => {
    mocks.target.mockResolvedValue({ makeupExamNotifications: false, isDisabled: false, roleAssignments: [{ tag }] })
    expect((await PUT(request({ makeupExamNotifications: true }), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('allows revoking a subscription after the recipient loses access or is disabled', async () => {
    mocks.target.mockResolvedValue({ makeupExamNotifications: true, isDisabled: true, roleAssignments: [] })
    expect((await PUT(request({ makeupExamNotifications: false }), params)).status).toBe(200)
  })
  it('cannot enable a disabled recipient', async () => {
    mocks.target.mockResolvedValue({ makeupExamNotifications: false, isDisabled: true, roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }] })
    expect((await PUT(request({ makeupExamNotifications: true }), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('does not audit unchanged subscriptions', async () => {
    expect((await PUT(request({ makeupExamNotifications: false }), params)).status).toBe(200)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('rejects preference injection through ordinary profile updates', async () => {
    expect((await PATCH(request({ makeupExamNotifications: true }), params)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('returns 404 for missing recipients', async () => {
    mocks.target.mockResolvedValue(null)
    expect((await PUT(request({ makeupExamNotifications: true }), params)).status).toBe(404)
  })
})
