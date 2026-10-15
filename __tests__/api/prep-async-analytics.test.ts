import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(), attendance: vi.fn(), rotations: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'student', role: 'STUDENT' }) }))
vi.mock('@/lib/student-mentor-contact', () => ({ getStudentMentorContact: async () => null }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  studentEnrollment: { findUnique: mocks.enrollment },
  attendanceRecord: { findMany: mocks.attendance, count: async () => 0 },
  lesson: { count: async () => 100 },
  examScore: { findMany: async () => [] },
  exam: { findMany: async () => [] },
  sundaySchoolAssignment: { findMany: mocks.rotations },
} }))

import { GET } from '@/app/api/students/[id]/analytics/route'
import { excludeAsyncLessonRecords } from '@/lib/attendance-utils'

async function analytics() {
  const response = await GET(new Request('http://localhost/api/students/student/analytics'), { params: Promise.resolve({ id: 'student' }) })
  expect(response.status).toBe(200)
  return response.json()
}

describe('Prep async dashboard attendance', () => {
  beforeEach(() => {
    mocks.enrollment.mockResolvedValue({ studentId: 'student', isAsyncStudent: true, yearLevel: null })
    mocks.attendance.mockResolvedValue([])
    mocks.rotations.mockResolvedValue([{
      id: 'rotation', startDate: new Date('2000-01-02'), totalWeeks: 4,
      isActive: true, yearLevel: null, class: { level: 'GRADE_1' }, rotationForm: null,
      logs: [1, 2, 3].map(weekNumber => ({ weekNumber, status: 'VERIFIED' })),
    }])
  })

  it('uses elapsed rotation weeks rather than lesson totals or rotation completion percentage', async () => {
    const body = await analytics()
    expect(body.attendance).toMatchObject({ percentage: 75, met: true, totalLessons: 4, allLessons: 4, presentCount: 3, absentCount: 1, lateCount: 0 })
    expect(body.graduation.attendanceMet).toBe(true)
    expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      AND: [{ NOT: { studentId: { in: ['student'] } } }],
    }) }))
  })

  it('does not report lesson attendance when no rotation has been assigned', async () => {
    mocks.rotations.mockResolvedValue([])
    const body = await analytics()
    expect(body.attendance).toMatchObject({ percentage: null, allLessons: 0, totalLessons: 0 })
    expect(body.graduation.eligible).toBe(false)
  })

  it('keeps lesson attendance for in-person students', async () => {
    mocks.enrollment.mockResolvedValue({ studentId: 'student', isAsyncStudent: false, yearLevel: 'YEAR_2' })
    mocks.attendance.mockResolvedValue([{ status: 'PRESENT' }, { status: 'LATE' }, { status: 'ABSENT' }])
    const body = await analytics()
    expect(body.attendance).toMatchObject({ percentage: 50, met: false, totalLessons: 3, lateCount: 1 })
  })

  it('excludes all lesson records for async students regardless of approval dates or slips', () => {
    expect(excludeAsyncLessonRecords([{ studentId: 'async', isAsyncStudent: true }, { studentId: 'in-person', isAsyncStudent: false }]))
      .toEqual({ NOT: { studentId: { in: ['async'] } } })
    expect(excludeAsyncLessonRecords([{ studentId: 'in-person', isAsyncStudent: false }])).toEqual({})
  })
})
