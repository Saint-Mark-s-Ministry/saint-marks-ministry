import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), principal: vi.fn(), access: vi.fn(),
  classes: vi.fn(), assignments: vi.fn(), calls: vi.fn(), child: vi.fn(), target: vi.fn(),
  update: vi.fn(), audit: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-access', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sunday-school-access')>(), getSundaySchoolAccess: mocks.access,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.principal }, sundaySchoolClass: { findMany: mocks.classes },
  sundaySchoolServantAssignment: { findMany: mocks.assignments }, sundaySchoolPhoneCall: { findMany: mocks.calls },
  $transaction: mocks.transaction,
} }))
import { GET, PUT } from '@/app/api/sunday-school/follow-up-assignments/route'

const request = (body: unknown) => new Request('http://localhost/api/sunday-school/follow-up-assignments', {
  method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
})

describe('child check-in assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'viewer', role: 'SUPER_ADMIN' }) // stale JWT claim must not grant scope
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set(['SUNDAY_SCHOOL_SERVANT']) })
    mocks.principal.mockResolvedValue({ id: 'viewer', role: 'SERVANT' })
    mocks.access.mockResolvedValue({
      isAdmin: false, readOnly: false, canRead: true, servantClassIds: new Set(['c1']),
      coordinatorClassIds: new Set(), visibleClassIds: new Set(['c1']),
    })
    mocks.classes.mockResolvedValue([{
      id: 'c1', name: 'Grade 1', academicYearId: 'y1',
      children: [{ id: 'kid', firstName: 'Mary', lastName: 'Mina', followUpAssignmentId: 'a1' }],
    }])
    mocks.assignments.mockResolvedValue([{ id: 'a1', classId: 'c1', academicYearId: 'y1', user: { id: 'servant', name: 'Servant One' } }])
    mocks.calls.mockResolvedValue([{ childId: 'kid', classId: 'c1', calledAt: new Date('2026-10-22'), outcome: 'NO_ANSWER' }])
    mocks.child.mockResolvedValue({ id: 'kid', classId: 'c1', isActive: true, class: { isActive: true, academicYearId: 'y1', academicYear: { isActive: true } } })
    mocks.target.mockResolvedValue({ id: 'a1' })
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.audit.mockResolvedValue({})
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolChild: { findUnique: mocks.child, updateMany: mocks.update },
      sundaySchoolServantAssignment: { findFirst: mocks.target }, auditEvent: { create: mocks.audit },
    }))
  })

  it('returns scoped children, active class servants, and this week’s latest call without contacts or notes', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/follow-up-assignments'))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.classes[0].children[0]).toEqual({ id: 'kid', firstName: 'Mary', lastName: 'Mina', assignmentId: 'a1', assignee: { id: 'servant', name: 'Servant One' }, callThisWeek: { calledAt: '2026-10-22T00:00:00.000Z', outcome: 'NO_ANSWER' } })
    expect(mocks.classes.mock.calls[0][0].where.id).toEqual({ in: ['c1'] })
    expect(mocks.calls.mock.calls[0][0].where.calledAt).toMatchObject({ gte: expect.any(Date), lt: expect.any(Date), lte: expect.any(Date) })
    expect(JSON.stringify(mocks.classes.mock.calls)).not.toMatch(/guardian|phone|notes/i)
    expect(mocks.access).toHaveBeenCalledWith({ id: 'viewer', role: 'SERVANT' })
  })

  it.each(['ended', 'disabled', 'transferred', 'old-year'])('shows %s assignments as unassigned', async reason => {
    mocks.assignments.mockResolvedValue(reason === 'old-year'
      ? [{ id: 'a1', classId: 'c1', academicYearId: 'old', user: { id: 'servant', name: 'Old' } }]
      : reason === 'transferred'
        ? [{ id: 'a1', classId: 'c2', academicYearId: 'y1', user: { id: 'servant', name: 'Other' } }]
        : [])
    const data = await (await GET(new Request('http://localhost/api/sunday-school/follow-up-assignments'))).json()
    expect(data.classes[0].children[0].assignee).toBeNull()
    expect(data.classes[0].children[0].assignmentId).toBeNull()
    expect(mocks.assignments.mock.calls[0][0].where).toMatchObject({ endedAt: null, user: { isDisabled: false } })
  })

  it('never counts another class’s call for a transferred child', async () => {
    mocks.calls.mockResolvedValue([{ childId: 'kid', classId: 'c2', calledAt: new Date(), outcome: 'CONNECTED' }])
    const data = await (await GET(new Request('http://localhost/api/sunday-school/follow-up-assignments'))).json()
    expect(data.classes[0].children[0].callThisWeek).toBeNull()
  })

  it('denies reading an out-of-scope class', async () => {
    expect((await GET(new Request('http://localhost/api/sunday-school/follow-up-assignments?classId=c2'))).status).toBe(403)
    expect(mocks.classes).not.toHaveBeenCalled()
  })

  it.each([false, true])('assigns or clears responsibility with an audit record (clear=%s)', async clear => {
    const assignmentId = clear ? null : 'a1'
    expect((await PUT(request({ childId: 'kid', assignmentId }))).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'kid', classId: 'c1', isActive: true }, data: { followUpAssignmentId: assignmentId } })
    if (!clear) expect(mocks.target.mock.calls[0][0].where).toEqual({ id: 'a1', classId: 'c1', academicYearId: 'y1', endedAt: null, user: { isDisabled: false } })
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'viewer', metadata: { classId: 'c1', assignmentId } }) })
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
  })

  it.each([null, {}, { childId: 'kid' }, { childId: 'kid', assignmentId: '' }, { childId: 'kid', assignmentId: 1 }])('rejects invalid assignment input %j', async body => {
    expect((await PUT(request(body))).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects a servant without active staffing in the child’s class/year', async () => {
    mocks.target.mockResolvedValue(null)
    expect((await PUT(request({ childId: 'kid', assignmentId: 'wrong' }))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each(['unassigned-prep', 'outside-class', 'inactive-child', 'inactive-class', 'inactive-year', 'priest', 'disabled'])('denies %s writes', async reason => {
    if (reason === 'unassigned-prep' || reason === 'outside-class') mocks.access.mockResolvedValue({ isAdmin: false, canRead: true, servantClassIds: new Set(), coordinatorClassIds: new Set(), visibleClassIds: new Set() })
    if (reason === 'inactive-child') mocks.child.mockResolvedValue({ id: 'kid', isActive: false })
    if (reason === 'inactive-class') mocks.child.mockResolvedValue({ id: 'kid', isActive: true, classId: 'c1', class: { isActive: false } })
    if (reason === 'inactive-year') mocks.child.mockResolvedValue({ id: 'kid', isActive: true, classId: 'c1', class: { isActive: true, academicYear: { isActive: false } } })
    if (reason === 'priest') mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set(['PRIEST']) })
    if (reason === 'disabled') mocks.context.mockResolvedValue({ disabled: true, roleTags: new Set() })
    expect((await PUT(request({ childId: 'kid', assignmentId: 'a1' }))).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns a retryable conflict for a concurrent staffing/roster change', async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6' }))
    expect((await PUT(request({ childId: 'kid', assignmentId: 'a1' }))).status).toBe(409)
  })
})
