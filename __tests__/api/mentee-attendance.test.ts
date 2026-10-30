import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), principal: vi.fn(), year: vi.fn(), enrollment: vi.fn(), records: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.principal },
  sundaySchoolYear: { findFirst: mocks.year },
  studentEnrollment: { findUnique: mocks.enrollment },
  attendanceRecord: { findMany: mocks.records },
} }))

import { GET } from '@/app/api/students/[id]/attendance/route'

const principal = (tags: RoleTag[] = [], studentIds = ['student-1'], disabled = false) => ({
  id: 'mentor-1', isDisabled: disabled, canAccessContactBook: false,
  roleAssignments: tags.map(tag => ({ tag })),
  mentorAssignments: studentIds.map(studentId => ({ studentEnrollment: { studentId } })),
  guardianOfChildren: [], linkedSundaySchoolChild: null,
})
const get = (id = 'student-1') => GET(new Request(`http://localhost/api/students/${id}/attendance`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'mentor-1', role: 'MENTOR' })
  mocks.principal.mockResolvedValue(principal())
  mocks.year.mockResolvedValue(null)
  mocks.enrollment.mockResolvedValue({ isAsyncStudent: false })
  mocks.records.mockResolvedValue([])
})

describe('read-only mentee attendance', () => {
  it('loads only the assigned student’s recorded lessons, newest first, without private fields', async () => {
    const record = { id: 'a1', status: 'PRESENT', notEnrolledYet: false, expectedAbsenceNA: false,
      lesson: { title: 'Prayer', scheduledDate: '2026-10-25T00:00:00.000Z' } }
    mocks.records.mockResolvedValue([record])
    const response = await get()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ isAsyncStudent: false, records: [record] })
    expect(mocks.records).toHaveBeenCalledWith({
      where: { studentId: 'student-1', lesson: { isExamDay: false, status: { notIn: ['CANCELLED', 'NO_CLASS'] } } },
      select: { id: true, status: true, notEnrolledYet: true, expectedAbsenceNA: true,
        lesson: { select: { title: true, scheduledDate: true } } },
      orderBy: [{ lesson: { scheduledDate: 'desc' } }, { id: 'desc' }],
    })
    expect(mocks.principal).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'mentor-1' },
      select: expect.objectContaining({ mentorAssignments: {
        where: { endedAt: null, studentEnrollment: { status: 'ACTIVE' } },
        select: { studentEnrollment: { select: { studentId: true } } },
      } }),
    }))
  })

  it('denies another student without loading their enrollment or history', async () => {
    expect((await get('student-2')).status).toBe(403)
    expect(mocks.enrollment).not.toHaveBeenCalled()
    expect(mocks.records).not.toHaveBeenCalled()
  })

  it('rechecks assignments and denies access after the mentor assignment ends', async () => {
    expect((await get()).status).toBe(200)
    mocks.principal.mockResolvedValue(principal([], []))
    expect((await get()).status).toBe(403)
    expect(mocks.records).toHaveBeenCalledTimes(1)
  })

  it.each([RoleTag.SUNDAY_SCHOOL_SERVANT, RoleTag.SERVANTS_PREP_STUDENT])('does not grant Prep history from the %s tag or a stale elevated JWT', async tag => {
    mocks.auth.mockResolvedValue({ id: 'mentor-1', role: 'SUPER_ADMIN' })
    mocks.principal.mockResolvedValue(principal([tag], []))
    expect((await get()).status).toBe(403)
    expect(mocks.records).not.toHaveBeenCalled()
  })

  it.each([RoleTag.SUPER_ADMIN, RoleTag.PRIEST, RoleTag.SERVANTS_PREP_SERVANT])('allows current Prep staff with tag %s', async tag => {
    mocks.principal.mockResolvedValue(principal([tag], []))
    expect((await get('student-2')).status).toBe(200)
  })

  it('denies disabled accounts even when they have a staff tag', async () => {
    mocks.principal.mockResolvedValue(principal([RoleTag.SUPER_ADMIN], [], true))
    expect((await get()).status).toBe(403)
    expect(mocks.records).not.toHaveBeenCalled()
  })

  it('returns no lesson history for current async students', async () => {
    mocks.enrollment.mockResolvedValue({ isAsyncStudent: true })
    expect(await (await get()).json()).toEqual({ isAsyncStudent: true, records: [] })
    expect(mocks.records).not.toHaveBeenCalled()
  })

  it('returns 404 for a removed enrollment after authorization', async () => {
    mocks.enrollment.mockResolvedValue(null)
    expect((await get()).status).toBe(404)
    expect(mocks.records).not.toHaveBeenCalled()
  })

  it('requires sign-in', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await get()).status).toBe(401)
    expect(mocks.records).not.toHaveBeenCalled()
  })
})
