import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), authorization: vi.fn(), access: vi.fn(), principal: vi.fn(), unenrolled: vi.fn(), session: vi.fn(),
  enrollment: vi.fn(), notes: vi.fn(), attendance: vi.fn(), rotations: vi.fn(), child: vi.fn(),
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
  user: { findUnique: mocks.principal, findFirst: mocks.unenrolled },
  studentEnrollment: { findUnique: mocks.enrollment }, studentNote: { findMany: mocks.notes },
  attendanceRecord: { findMany: mocks.attendance }, sundaySchoolAssignment: { findMany: mocks.rotations },
  sundaySchoolChild: { findUnique: mocks.child },
} }))

import { GET as prepHistory } from '@/app/api/students/[id]/history/route'
import { GET as childHistory } from '@/app/api/sunday-school/children/[id]/history/route'

const request = new Request('http://localhost/history')
const params = { params: Promise.resolve({ id: 'student-1' }) }
const record = (id: string, status: string, extra = {}) => ({
  id, status, notes: null, notEnrolledYet: false, expectedAbsenceNA: false,
  lesson: { title: 'Lesson', scheduledDate: new Date('2026-01-04'), isExamDay: false, academicYear: { name: '2025–2026' } },
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff-1', role: 'SUPER_ADMIN' })
  mocks.authorization.mockResolvedValue({ disabled: false, prepStudentScope: { kind: 'all' }, roleTags: new Set(['SUNDAY_SCHOOL_SERVANT']) })
  mocks.session.mockResolvedValue({})
  mocks.enrollment.mockResolvedValue({
    student: { id: 'student-1', name: 'Mina Mark' }, yearLevel: 'YEAR_1', isAsyncStudent: false, notes: 'Enrollment note',
  })
  mocks.notes.mockResolvedValue([{ id: 'note-1', content: 'Follow up', createdAt: new Date('2026-01-04'), author: { name: 'Mentor' } }])
  mocks.attendance.mockResolvedValue([])
  mocks.unenrolled.mockResolvedValue(null)
  mocks.childAccount.mockReturnValue(null)
  mocks.childPhoto.mockReturnValue(null)
  mocks.principal.mockResolvedValue({ id: 'staff-1', role: 'SERVANT', isDisabled: false })
  mocks.access.mockResolvedValue({
    canRead: true, isAdmin: false, readOnly: false,
    visibleClassIds: new Set(['class-1']), servantClassIds: new Set(['class-1']), coordinatorClassIds: new Set(),
  })
  mocks.child.mockImplementation(async ({ select }: { select: { firstName?: boolean } }) => select.firstName ? {
    id: 'student-1', firstName: 'Mina', lastName: 'Mark', notes: 'Roster note', class: { name: 'Grade 5' },
    user: mocks.childAccount(),
    photoUrl: mocks.childPhoto(),
    attendance: [{ id: 'mark-1', status: 'PRESENT', notes: 'On time', session: { date: new Date('2026-01-04'), topic: 'Faith', class: { name: 'Grade 5' } } }],
    visitations: [{ id: 'visit-1', status: 'DONE', visitedAt: new Date('2026-01-05'), createdAt: new Date('2026-01-06'), notes: 'Visited', recorder: { name: 'Servant' } }],
    phoneCalls: [{ id: 'call-1', calledAt: new Date('2026-01-07'), outcome: 'CONNECTED', note: 'Spoke', callerName: 'Servant' }],
  } : { id: 'student-1', classId: 'class-1', enrollments: [] })
})
afterEach(() => vi.useRealTimers())

describe('Prep student history', () => {
  it('returns a safe projection, notes, and correctly weighted lesson attendance', async () => {
    mocks.attendance.mockResolvedValue([
      record('present', 'PRESENT'), record('late', 'LATE'), record('excused', 'EXCUSED'),
      record('na', 'ABSENT', { notEnrolledYet: true }), record('expected-na', 'ABSENT', { expectedAbsenceNA: true }),
      record('exam', 'ABSENT', { lesson: { ...record('', '').lesson, isExamDay: true } }),
    ])
    const response = await prepHistory(request, params)
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.attendance.rate).toBe(75)
    expect(data.attendance.counts).toEqual({ present: 1, late: 1, absent: 0, excused: 1 })
    expect(data.attendance.records).toHaveLength(6)
    expect(data.notes.entries[0].content).toBe('Follow up')
    expect(data.visitations).toBeNull()
    expect(mocks.attendance.mock.calls[0][0].where.lesson.status.in).toEqual(['SCHEDULED', 'COMPLETED'])
    expect(mocks.enrollment.mock.calls[0][0].select.student).toEqual({ select: { id: true, name: true } })
  })

  it('allows an assigned mentor through the current database scope', async () => {
    mocks.auth.mockResolvedValue({ id: 'mentor-1', role: 'MENTOR' })
    mocks.authorization.mockResolvedValue({ disabled: false, prepStudentScope: { kind: 'ids', ids: new Set(['student-1']) } })
    expect((await prepHistory(request, params)).status).toBe(200)
  })

  it.each([
    { disabled: true, prepStudentScope: { kind: 'all' } },
    { disabled: false, prepStudentScope: { kind: 'none' } },
    { disabled: false, prepStudentScope: { kind: 'ids', ids: new Set(['another-student']) } },
  ])('denies disabled, unassigned, and out-of-scope viewers before reading records', async authorization => {
    mocks.authorization.mockResolvedValue(authorization)
    expect((await prepHistory(request, params)).status).toBe(403)
    expect(mocks.enrollment).not.toHaveBeenCalled()
    expect(mocks.notes).not.toHaveBeenCalled()
  })

  it('uses only elapsed rotation weeks for current async students', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-14T12:00:00Z'))
    mocks.enrollment.mockResolvedValue({ student: { id: 'student-1', name: 'Mina Mark' }, isAsyncStudent: true, yearLevel: null, notes: null })
    mocks.rotations.mockResolvedValue([{ id: 'rotation-1', grade: 'GRADE_1', startDate: new Date('2026-01-04'), totalWeeks: 4, logs: [
      { weekNumber: 1, status: 'VERIFIED' }, { weekNumber: 3, status: 'MANUAL' },
    ] }])
    const data = await (await prepHistory(request, params)).json()
    expect(mocks.attendance).not.toHaveBeenCalled()
    expect(data.attendance.kind).toBe('rotations')
    expect(data.attendance.records.map((row: { status: string }) => row.status)).toEqual(['ABSENT', 'PRESENT'])
    expect(data.attendance.rate).toBe(50)
  })

  it('returns 404 for a missing student', async () => {
    mocks.enrollment.mockResolvedValue(null)
    expect((await prepHistory(request, params)).status).toBe(404)
  })

  it('shows notes for an approved student who is not enrolled yet', async () => {
    mocks.enrollment.mockResolvedValue(null)
    mocks.unenrolled.mockResolvedValue({ id: 'student-1', name: 'Mina Mark' })
    const response = await prepHistory(request, params)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.subtitle).toContain('Not enrolled')
    expect(data.notes.entries[0].content).toBe('Follow up')
    expect(mocks.unenrolled).toHaveBeenCalledWith({ where: { id: 'student-1', role: 'STUDENT' }, select: { id: true, name: true } })
  })

  it('requires authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await prepHistory(request, params)).status).toBe(401)
  })
})

describe('Sunday School child history', () => {
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

  it('scopes every historical relation to visible classes and omits confidential and contact fields', async () => {
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
    expect(select).not.toHaveProperty('guardianPhone')
    expect(select).not.toHaveProperty('family')
    expect(mocks.access).toHaveBeenCalledWith({ id: 'staff-1', role: 'SERVANT', isDisabled: false })
  })

  it('denies a child outside the viewer’s class even with a stale admin session', async () => {
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: false, visibleClassIds: new Set(['other-class']) })
    expect((await childHistory(request, params)).status).toBe(403)
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
