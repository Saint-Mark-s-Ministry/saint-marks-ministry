vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: async () => null }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ student: vi.fn(), attendance: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'admin', role: 'SUPER_ADMIN' }) }))
vi.mock('@/lib/student-mentor-contact', () => ({ withUserMentorContacts: async (students: unknown[]) => students }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.student },
  attendanceRecord: { findMany: mocks.attendance },
  examScore: { findMany: async () => [] },
  exam: { findMany: async () => [] },
  lesson: { findMany: async () => [] },
} }))
import { GET } from '@/app/api/students/[id]/details/route'

beforeEach(() => mocks.attendance.mockResolvedValue([]))

describe('Prep admin student details attendance', () => {
  it.each([null, '2026-10-11T15:14:01.226Z'])(
    'excludes all lesson records for a current async student (approval %s)', async asyncApprovedAt => {
      mocks.student.mockResolvedValue({ id: 'student', enrollments: [{ isAsyncStudent: true, yearLevel: null, asyncApprovedAt }] })
      const response = await GET(new Request('http://localhost/api/students/student/details'), { params: Promise.resolve({ id: 'student' }) })
      expect(response.status).toBe(200)
      expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
        studentId: 'student', NOT: { studentId: { in: ['student'] } },
      }) }))
    },
  )
})
