import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), authorization: vi.fn(), access: vi.fn(), principal: vi.fn(), session: vi.fn(),
  child: vi.fn(),
  childAccount: vi.fn(),
  childPhoto: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/authorization', async original => ({
  ...(await original<typeof import('@/lib/authorization')>()), getAuthorizationContext: mocks.authorization,
}))
vi.mock('@/lib/sunday-school-access', async original => ({
  ...(await original<typeof import('@/lib/sunday-school-access')>()), getSundaySchoolAccess: mocks.access,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.principal },
  sundaySchoolChild: { findUnique: mocks.child },
} }))

import { GET as childHistory } from '@/app/api/sunday-school/children/[id]/history/route'

const request = new Request('http://localhost/history')
const params = { params: Promise.resolve({ id: 'student-1' }) }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff-1', role: 'SUPER_ADMIN' })
  mocks.authorization.mockResolvedValue({ disabled: false, roleTags: new Set(['SUNDAY_SCHOOL_SERVANT']) })
  mocks.session.mockResolvedValue({})
  mocks.childAccount.mockReturnValue(null)
  mocks.childPhoto.mockReturnValue(null)
  mocks.principal.mockResolvedValue({ id: 'staff-1', role: 'SERVANT', isDisabled: false })
  mocks.access.mockResolvedValue({
    canRead: true, isAdmin: false, readOnly: false,
    visibleClassIds: new Set(['class-1']), servantClassIds: new Set(['class-1']), coordinatorClassIds: new Set(),
  })
  mocks.child.mockImplementation(async ({ select }: { select: { firstName?: boolean } }) => select.firstName ? {
    id: 'student-1', firstName: 'Mina', lastName: 'Mark', notes: 'Roster note', class: { name: 'Grade 5' },
    level: 'GRADE_5', birthDate: new Date('2015-03-12'), gender: 'MALE', isActive: true, classId: 'class-1', visitationPriority: true,
    cellPhone: '555-0100', fatherOfConfession: 'Fr. Mark',
    guardianName: 'Guardian Mark', guardianPhone: '555-0101', guardianEmail: 'guardian@example.com',
    family: { name: 'Mark Family', homeAddress: '123 Main Street', motherName: 'Mary Mark', motherPhone: '555-0102', motherEmail: 'mother@example.com', fatherName: 'John Mark', fatherPhone: '555-0103', fatherEmail: 'father@example.com' },
    user: mocks.childAccount(),
    photoUrl: mocks.childPhoto(),
    attendance: [{ id: 'mark-1', status: 'PRESENT', notes: 'On time', session: { date: new Date('2026-01-04'), topic: 'Faith', class: { name: 'Grade 5' } } }],
    visitations: [{ id: 'visit-1', status: 'DONE', visitedAt: new Date('2026-01-05'), createdAt: new Date('2026-01-06'), notes: 'Visited', recorder: { name: 'Servant' } }],
    phoneCalls: [{ id: 'call-1', calledAt: new Date('2026-01-07'), outcome: 'CONNECTED', note: 'Spoke', callerName: 'Servant' }],
  } : { id: 'student-1', classId: 'class-1', enrollments: [] })
})
describe('Sunday School child history', () => {
  it('lets people who serve the class change the priority-visit star, and only them', async () => {
    let body = await (await childHistory(request, params)).json()
    expect(body.priority).toEqual({ value: true, canEdit: true })

    mocks.access.mockResolvedValue({
      canRead: true, isAdmin: false, readOnly: false,
      visibleClassIds: new Set(['class-1']), servantClassIds: new Set(), coordinatorClassIds: new Set(),
    })
    body = await (await childHistory(request, params)).json()
    expect(body.priority).toEqual({ value: true, canEdit: false })
  })

  it('requires authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await childHistory(request, params)).status).toBe(401)
  })

  it.each([
    [null, false],
    [{ isDisabled: false, enrollments: [] }, false],
    [{ isDisabled: true, enrollments: [{ id: 'prep-enrollment' }] }, false],
    [{ isDisabled: false, enrollments: [{ id: 'prep-enrollment' }] }, true],
  ])('includes current Prep status without account or enrollment details: %o', async (account, expected) => {
    mocks.childAccount.mockReturnValue(account)
    const response = await childHistory(request, params)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.isServantsPrepStudent).toBe(expected)
    expect(data).not.toHaveProperty('user')
    expect(JSON.stringify(data)).not.toContain('prep-enrollment')
    expect(mocks.child.mock.calls[1][0].select.user).toEqual({ select: {
      isDisabled: true,
      profileImageUrl: true,
      phone: true, email: true,
      enrollments: { where: { isActive: true, status: 'ACTIVE' }, select: { id: true }, take: 1 },
    } })
  })

  it.each([
    ['https://example.test/child.jpg', 'https://example.test/prep.jpg', 'https://example.test/child.jpg'],
    [null, 'https://example.test/prep.jpg', 'https://example.test/prep.jpg'],
    [null, null, null],
  ])('resolves the history photo with Sunday School taking priority: %s / %s', async (childPhoto, accountPhoto, expected) => {
    mocks.childPhoto.mockReturnValue(childPhoto)
    mocks.childAccount.mockReturnValue({ isDisabled: false, enrollments: [], profileImageUrl: accountPhoto })
    const response = await childHistory(request, params)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.photoUrl).toBe(expected)
    expect(data).not.toHaveProperty('user')
  })

  it('scopes historical records and returns profile contacts only in the authorized child response', async () => {
    const response = await childHistory(request, params)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.notes.general).toBe('Roster note')
    expect(data.attendance.rate).toBe(100)
    expect(data.visitations[0].notes).toBe('Visited')
    expect(data.phoneCalls[0].outcome).toBe('CONNECTED')
    const { select } = mocks.child.mock.calls[1][0]
    expect(select.attendance.where).toEqual({ session: { classId: { in: ['class-1'] } } })
    expect(select.visitations.where).toEqual({ classId: { in: ['class-1'] } })
    expect(select.phoneCalls.where).toEqual({ classId: { in: ['class-1'] } })
    expect(select.visitations.select).not.toHaveProperty('priestNotes')
    expect(data.profile.guardian).toEqual({ name: 'Guardian Mark', phone: '555-0101', email: 'guardian@example.com' })
    expect(data.profile.family).toMatchObject({ motherPhone: '555-0102', fatherEmail: 'father@example.com', homeAddress: '123 Main Street' })
    expect(data.profile.birthDate).toBe('2015-03-12T00:00:00.000Z')
    expect(select.family.select).not.toHaveProperty('children')
    expect(select.user.select).not.toHaveProperty('password')
    expect(data).not.toHaveProperty('user')
    expect(mocks.access).toHaveBeenCalledWith({ id: 'staff-1', role: 'SERVANT', isDisabled: false })
  })

  it('denies a child outside the viewer’s class even with a stale admin session', async () => {
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: false, visibleClassIds: new Set(['other-class']) })
    const response = await childHistory(request, params)
    expect(response.status).toBe(403)
    expect(await response.json()).not.toHaveProperty('profile')
    expect(mocks.child).toHaveBeenCalledTimes(1)
  })

  it('denies an unassigned prep servant', async () => {
    mocks.access.mockResolvedValue({ canRead: false })
    expect((await childHistory(request, params)).status).toBe(403)
    expect(mocks.child).not.toHaveBeenCalled()
  })

  it('denies a disabled account', async () => {
    mocks.principal.mockResolvedValue({ id: 'staff-1', role: 'SUPER_ADMIN', isDisabled: true })
    expect((await childHistory(request, params)).status).toBe(403)
    expect(mocks.child).not.toHaveBeenCalled()
  })

  it('allows priests to read across classes without adding write operations', async () => {
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: true, visibleClassIds: 'all' })
    expect((await childHistory(request, params)).status).toBe(200)
    const { select } = mocks.child.mock.calls[1][0]
    expect(select.visitations.where).toEqual({})
  })

  it('keeps an empty class scope closed', async () => {
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: false, visibleClassIds: new Set() })
    expect((await childHistory(request, params)).status).toBe(403)
  })

  it.each([
    ['555-0100', '555-0199', '555-0100'],
    [null, '555-0199', '555-0199'],
    [null, null, null],
  ])('uses the child phone before the linked account phone: %s / %s', async (childPhone, accountPhone, expected) => {
    const original = mocks.child.getMockImplementation()!
    mocks.child.mockImplementation(async args => {
      const result = await original(args)
      return args.select.firstName ? { ...result, cellPhone: childPhone } : result
    })
    mocks.childAccount.mockReturnValue({ isDisabled: false, enrollments: [], phone: accountPhone, email: 'student@example.com' })
    const response = await childHistory(request, params)
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.profile.phone).toBe(expected)
    expect(data.profile.email).toBe('student@example.com')
  })

  it('does not advertise private notes to Super Admins', async () => {
    mocks.authorization.mockResolvedValue({ disabled: false, roleTags: new Set(['SUPER_ADMIN']) })
    const data = await (await childHistory(request, params)).json()
    expect(data.canReadPrivateNotes).toBe(false)
  })

  it('does not advertise private notes in View as mode', async () => {
    mocks.session.mockResolvedValue({ impersonating: { originalUserId: 'admin-1' } })
    const data = await (await childHistory(request, params)).json()
    expect(data.canReadPrivateNotes).toBe(false)
  })
})
