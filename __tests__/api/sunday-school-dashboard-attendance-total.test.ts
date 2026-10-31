import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  academicYearFindFirst: vi.fn(),
  academicYearFindMany: vi.fn(),
  classFindMany: vi.fn(),
  ageGroupFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  sessionGroupBy: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sunday-school-access')>()
  return {
    ...actual,
    getSundaySchoolAccess: mocks.getAccess,
    // Pure predicates — fixed to a simple "can serve and coordinate everything" shape,
    // since only the aggregate attendance total is under test here.
    canServeClass: () => true,
    canCoordinateClass: () => true,
    canViewServantAttendanceReport: () => false,
  }
})
vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: mocks.academicYearFindFirst, findMany: mocks.academicYearFindMany },
    sundaySchoolClass: { findMany: mocks.classFindMany },
    sundaySchoolAgeGroup: { findMany: mocks.ageGroupFindMany },
    sundaySchoolChildAttendance: { findMany: mocks.attendanceFindMany },
    sundaySchoolSession: { groupBy: mocks.sessionGroupBy, findMany: vi.fn().mockResolvedValue([]) },
  },
}))

import { GET } from '@/app/api/sunday-school/dashboard/route'

const classRow = {
  id: 'c1',
  name: 'Class A',
  level: 'GRADE_1',
  assignments: [],
  _count: { children: 10 },
  sessions: [],
}

describe('GET /api/sunday-school/dashboard — totals.attendancePercentage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.getAccess.mockResolvedValue({
      isAdmin: true,
      readOnly: false,
      canRead: true,
      visibleClassIds: 'all',
      coordinatorAgeGroupIds: new Set(),
    })
    mocks.academicYearFindFirst.mockResolvedValue({
      id: 'year-active',
      name: '2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-01'),
      isActive: true,
    })
    // Empty, so `selectedAcademicYear` resolves to null and the attendance-
    // trend block (unrelated to this total) is skipped entirely.
    mocks.academicYearFindMany.mockResolvedValue([])
    mocks.classFindMany.mockResolvedValue([classRow])
    mocks.ageGroupFindMany.mockResolvedValue([])
    mocks.sessionGroupBy.mockResolvedValue([])
  })

  it('computes the weighted attendance percentage across every visible class (happy path)', async () => {
    mocks.attendanceFindMany.mockResolvedValue([
      { status: 'PRESENT', session: { classId: 'c1' } },
      { status: 'LATE', session: { classId: 'c1' } },
      { status: 'ABSENT', session: { classId: 'c1' } },
      { status: 'ABSENT', session: { classId: 'c1' } },
    ])

    const response = await GET(new Request('http://localhost/api/sunday-school/dashboard'))
    const body = await response.json()

    // (1 present + 0.5 late) / 4 total = 37.5%
    expect(body.totals.attendancePercentage).toBe(37.5)
  })

  it('reads as 0, not NaN, when no attendance has been recorded yet (highest-risk path)', async () => {
    mocks.attendanceFindMany.mockResolvedValue([])

    const response = await GET(new Request('http://localhost/api/sunday-school/dashboard'))
    const body = await response.json()

    expect(body.totals.attendancePercentage).toBe(0)
  })
})
