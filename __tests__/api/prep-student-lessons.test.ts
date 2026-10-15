import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ enrollment: vi.fn(), lessons: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'student', role: 'STUDENT' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  studentEnrollment: { findUnique: mocks.enrollment },
  lesson: { findMany: mocks.lessons },
  academicYear: { findFirst: async () => ({ id: 'year' }) },
} }))
import { GET } from '@/app/api/students/[id]/lessons/route'

const dates = ['2026-10-02T00:00:00Z', '2026-10-09T00:00:00Z']
async function getLessons() {
  const response = await GET(new Request('http://localhost/api/students/student/lessons'), { params: Promise.resolve({ id: 'student' }) })
  expect(response.status).toBe(200)
  return response.json()
}

describe('Prep student lesson attendance', () => {
  beforeEach(() => {
    mocks.lessons.mockResolvedValue(dates.map((scheduledDate, i) => ({
      id: `lesson-${i}`, title: 'Lesson', scheduledDate: new Date(scheduledDate),
      resources: [{ id: 'resource', title: 'Notes' }],
      // Defend the response even if a stale record reaches the mapper.
      attendanceRecords: [{ id: `record-${i}`, status: 'ABSENT', slipId: i ? 'old-slip' : null }],
    })))
  })

  it.each([null, '2026-10-11T15:14:01.226Z', '2026-10-15T18:00:00Z', '2026-09-01T00:00:00Z'])(
    'makes Oct 2 and Oct 9 exempt for any current async student (approval %s)', async asyncApprovedAt => {
      mocks.enrollment.mockResolvedValue({ isActive: true, isAsyncStudent: true, yearLevel: null, asyncApprovedAt })
      const lessons = await getLessons()
      expect(lessons).toHaveLength(2)
      for (const lesson of lessons) {
        expect(lesson.attendance).toBeNull()
        expect(lesson.asyncPeriod).toBe(true)
        expect(lesson.resources).toHaveLength(1)
      }
      expect(mocks.lessons).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
        attendanceRecords: expect.objectContaining({ where: { studentId: 'student', NOT: { studentId: { in: ['student'] } } } }),
      }) }))
    },
  )

  it('keeps actual lesson attendance for in-person students', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: true, isAsyncStudent: false, yearLevel: 'YEAR_2' })
    const lessons = await getLessons()
    expect(lessons[0]).toMatchObject({ asyncPeriod: false, attendance: { status: 'ABSENT' } })
  })
})
