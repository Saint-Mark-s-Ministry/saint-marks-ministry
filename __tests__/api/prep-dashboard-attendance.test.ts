import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ rotations: vi.fn(), attendance: vi.fn(), groupedAttendance: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'admin', role: 'SUPER_ADMIN' }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  academicYear: { findMany: async () => [] },
  examSection: { findMany: async () => [] },
  examScore: { findMany: async () => [], groupBy: async () => [] },
  exam: { findMany: async () => [], groupBy: async () => [] },
  lesson: { groupBy: async () => [] },
  studentEnrollment: { findMany: async (args: { where: { isAsyncStudent?: boolean } }) => args.where.isAsyncStudent
    ? [{ studentId: 'async', isAsyncStudent: true }]
    : [{ student: { id: 'async', name: 'Async Student' }, isAsyncStudent: true, yearLevel: null }] },
  sundaySchoolAssignment: { findMany: mocks.rotations },
  attendanceRecord: { findMany: mocks.attendance, groupBy: mocks.groupedAttendance },
} }))
import { GET } from '@/app/api/dashboard/analytics/route'

describe('Prep admin dashboard rotation attendance', () => {
  beforeEach(() => {
    mocks.attendance.mockResolvedValue([])
    // A historical lesson record must not override rotation attendance.
    mocks.groupedAttendance.mockResolvedValue([{ studentId: 'async', status: 'ABSENT', _count: 20 }])
    mocks.rotations.mockResolvedValue([{
      studentId: 'async', startDate: new Date('2000-01-02'), totalWeeks: 4,
      logs: [1, 2, 3, 4].map(weekNumber => ({ weekNumber, status: 'VERIFIED' })),
    }])
  })

  it('bases on-track counts on rotation attendance and excludes async lessons from year summaries', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.programOverview).toMatchObject({ studentsWithGoodAttendance: 1, studentsWithLowAttendance: 0 })
    expect(body.totalAtRisk).toBe(0)
    expect(mocks.attendance).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ NOT: { studentId: { in: ['async'] } } }) }))
  })

  it('flags low rotation attendance even if lessons would otherwise pass', async () => {
    mocks.groupedAttendance.mockResolvedValue([{ studentId: 'async', status: 'PRESENT', _count: 20 }])
    mocks.rotations.mockResolvedValue([{ studentId: 'async', startDate: new Date('2000-01-02'), totalWeeks: 4, logs: [] }])
    const body = await (await GET()).json()
    expect(body.programOverview.studentsWithLowAttendance).toBe(1)
    expect(body.atRiskStudents[0]).toMatchObject({ attendanceRate: 0, issues: ['Low rotation attendance: 0.00%'] })
  })
})
