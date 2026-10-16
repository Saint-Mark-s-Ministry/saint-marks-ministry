import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), access: vi.fn(), year: vi.fn(), priests: vi.fn(),
  classes: vi.fn(), groups: vi.fn(), assignments: vi.fn(),
    priest: vi.fn(), createGroup: vi.fn(), updateGroup: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', () => ({ getSundaySchoolAccess: mocks.access }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  academicYear: { findFirst: mocks.year }, user: { findMany: mocks.priests, findFirst: mocks.priest },
  sundaySchoolClass: { findMany: mocks.classes },
  sundaySchoolAgeGroup: { findMany: mocks.groups, create: mocks.createGroup, update: mocks.updateGroup },
  sundaySchoolServantAssignment: { findMany: mocks.assignments },
} }))
import { GET } from '@/app/api/sunday-school/organization/route'

describe('Sunday School organization API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.access.mockResolvedValue({ isAdmin: true })
    mocks.year.mockResolvedValue({ id: 'active-year', name: '2026' })
    for (const query of [mocks.priests, mocks.classes, mocks.groups, mocks.assignments]) query.mockResolvedValue([])
  })
  it('requires authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await GET()).status).toBe(401)
    expect(mocks.year).not.toHaveBeenCalled()
  })
  it.each(['SERVANT', 'SERVANT_PREP', 'PRIEST', 'STUDENT', 'MENTOR', 'PARENT'])('does not expose the admin directory to %s', async role => {
    mocks.auth.mockResolvedValue({ id: 'viewer', role })
    mocks.access.mockResolvedValue({ isAdmin: false, canRead: true })
    expect((await GET()).status).toBe(403)
    expect(mocks.assignments).not.toHaveBeenCalled()
  })
  it('returns only active-year staffing and minimal person information', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(mocks.assignments).toHaveBeenCalledWith({
      where: {
        academicYearId: 'active-year',
        endedAt: null,
        user: { isDisabled: false },
      },
      select: { authority: true, classId: true, ageGroupId: true, user: { select: { id: true, name: true, profileImageUrl: true } } },
    })
    expect(mocks.classes).toHaveBeenCalledWith(expect.objectContaining({ where: { academicYearId: 'active-year', isActive: true } }))
    expect(mocks.groups).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }))
    expect(mocks.priests).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'PRIEST', isDisabled: false } }))
  })
  it('does not fall back to historical assignments when no year is active', async () => {
    mocks.year.mockResolvedValue(null)
    const response = await GET()
    expect(await response.json()).toEqual({ academicYear: null, priests: [], classes: [], ageGroups: [], assignments: [] })
    expect(mocks.assignments).not.toHaveBeenCalled()
  })
})


import { GET as GET_AGE_GROUPS, POST } from '@/app/api/sunday-school/age-groups/route'
import { PATCH } from '@/app/api/sunday-school/age-groups/[id]/route'
const context = { params: Promise.resolve({ id: 'elementary' }) }
const request = (overseerId: unknown) => new Request('http://localhost/api/sunday-school/age-groups/elementary', { method: 'PATCH', body: JSON.stringify({ name: 'Elementary', levels: ['GRADE_1'], overseerId }) })

describe('priest overseer assignments', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.priest.mockResolvedValue({ id: 'priest' })
    mocks.groups.mockResolvedValue([])
    mocks.createGroup.mockResolvedValue({ id: 'elementary' })
    mocks.updateGroup.mockResolvedValue({ id: 'elementary' })
  })
  it('allows an administrator to assign and clear an overseer', async () => {
    expect((await PATCH(request('priest'), context)).status).toBe(200)
    expect(mocks.priest).toHaveBeenCalledWith({ where: { id: 'priest', role: 'PRIEST', isDisabled: false }, select: { id: true } })
    expect(mocks.updateGroup).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ overseerId: 'priest' }) }))
    expect((await PATCH(request(null), context)).status).toBe(200)
    expect(mocks.updateGroup).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ overseerId: null }) }))
  })
  it('allows a priest to assign an overseer', async () => {
    mocks.auth.mockResolvedValue({ id: 'priest', role: 'PRIEST' })
    expect((await PATCH(request('priest'), context)).status).toBe(200)
    expect((await POST(request('priest'))).status).toBe(201)
  })
  it('supports assigning an overseer when creating an age group', async () => {
    expect((await POST(request('priest'))).status).toBe(201)
    expect(mocks.createGroup).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ overseerId: 'priest' }) }))
  })
  it.each(['SERVANT', 'SERVANT_PREP'])('does not grant %s permission to assign overseers', async role => {
    mocks.auth.mockResolvedValue({ id: 'viewer', role })
    expect((await PATCH(request('priest'), context)).status).toBe(403)
    expect((await POST(request('priest'))).status).toBe(403)
    expect(mocks.updateGroup).not.toHaveBeenCalled()
  })
  it('rejects disabled priests, non-priests, and nonexistent users', async () => {
    mocks.priest.mockResolvedValue(null)
    expect((await PATCH(request('invalid'), context)).status).toBe(400)
    expect((await POST(request('invalid'))).status).toBe(400)
    expect(mocks.updateGroup).not.toHaveBeenCalled()
  })
  it.each([12, {}, ''])('rejects invalid overseer values', async value => {
    expect((await PATCH(request(value), context)).status).toBe(400)
    expect((await POST(request(value))).status).toBe(400)
  })
})

describe('age group coordinator listing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.access.mockResolvedValue({
      isAdmin: true,
      canRead: true,
      coordinatorAgeGroupIds: new Set(),
    })
    mocks.year.mockResolvedValue({ id: 'active-year' })
    mocks.groups.mockResolvedValue([{
      id: 'middle-school',
      name: 'Middle School',
      sundaySchoolYearId: null,
      levels: ['GRADE_6'],
      assignments: [],
    }])
    mocks.assignments.mockResolvedValue([{
      id: 'assignment-1',
      userId: 'coordinator-1',
      academicYearId: 'active-year',
      sundaySchoolYearId: null,
      ageGroupId: 'middle-school',
      classId: null,
      authority: 'COORDINATOR',
      user: { id: 'coordinator-1', name: 'Mina Coordinator', email: 'mina@example.com' },
    }])
  })

  it('returns active coordinators for legacy age groups without a Sunday School year', async () => {
    const response = await GET_AGE_GROUPS()
    const groups = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.assignments).toHaveBeenCalledWith({
      where: {
        academicYearId: 'active-year',
        ageGroupId: { in: ['middle-school'] },
        endedAt: null,
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    })
    expect(groups[0].assignments).toEqual([
      expect.objectContaining({ id: 'assignment-1', ageGroupId: 'middle-school' }),
    ])
  })
})
