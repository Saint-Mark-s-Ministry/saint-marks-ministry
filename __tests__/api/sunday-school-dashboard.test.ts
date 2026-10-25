import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  visibleClassFilter: vi.fn(),
  findYear: vi.fn(),
  findYears: vi.fn(),
  findClasses: vi.fn(),
  findSessions: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.access,
  visibleClassFilter: mocks.visibleClassFilter,
  canCoordinateClass: () => true,
  canServeClass: () => true,
  canViewServantAttendanceReport: () => true,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    academicYear: { findFirst: mocks.findYear, findMany: mocks.findYears },
    sundaySchoolClass: { findMany: mocks.findClasses },
    sundaySchoolAgeGroup: { findMany: async () => [] },
    sundaySchoolChildAttendance: { findMany: async () => [] },
    sundaySchoolSession: { findMany: mocks.findSessions, groupBy: async () => [] },
  },
}))

import { GET } from '@/app/api/sunday-school/dashboard/route'

const year = {
  id: 'current', name: '2026-2027', isActive: true,
  startDate: new Date('2026-09-01'), endDate: new Date('2027-09-01'),
}
const classes = [300, 474].map((count, index) => ({
  id: `class-${index}`, name: `Class ${index}`, level: 'GRADE_6', classroom: null,
  assignments: [], sessions: [], _count: { children: count },
}))

async function dashboard(params = '') {
  const response = await GET(new Request(`http://localhost/api/sunday-school/dashboard${params}`))
  expect(response.status).toBe(200)
  return response.json()
}

describe('Sunday School dashboard enrollment and recording coverage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: true, visibleClassIds: 'all', coordinatorAgeGroupIds: new Set() })
    mocks.findYear.mockResolvedValue(year)
    mocks.findYears.mockResolvedValue([
      year, { ...year, id: 'past', isActive: false, startDate: new Date('2025-09-01') },
    ])
    mocks.findClasses.mockResolvedValue(classes)
    mocks.findSessions.mockResolvedValue([
      { classId: 'class-0', date: new Date('2026-09-13'), attendance: [{ status: 'PRESENT' }, { status: 'ABSENT' }] },
      { classId: 'class-1', date: new Date('2026-09-13'), attendance: [] },
      { classId: 'class-1', date: new Date('2026-09-20'), attendance: [{ status: 'PRESENT' }] },
    ])
  })

  afterEach(() => vi.useRealTimers())

  it('keeps the 774 enrolled reference independent of weekly attendance submissions', async () => {
    const result = await dashboard()
    expect(result.totals.children).toBe(774)
    expect(result.attendanceTrend.currentEnrolledCount).toBe(774)
    expect(result.attendanceTrend.classCount).toBe(2)
    expect(result.attendanceTrend.points.slice(0, 2)).toEqual([
      { date: '2026-09-13', attendedCount: 1, recordedCount: 2, recordedClassCount: 1, attendanceRate: 50 },
      { date: '2026-09-20', attendedCount: 1, recordedCount: 1, recordedClassCount: 1, attendanceRate: 100 },
    ])
    expect(mocks.findSessions.mock.calls[0][0].select.classId).toBe(true)
  })

  it('scopes the current enrolled reference to the selected class', async () => {
    const result = await dashboard('?classId=class-1')
    expect(result.attendanceTrend.currentEnrolledCount).toBe(474)
    expect(result.attendanceTrend.classCount).toBe(1)
    expect(mocks.findSessions.mock.calls[0][0].where.classId.in).toEqual(['class-1'])
  })

  it('keeps enrollment visible when no attendance has been saved', async () => {
    mocks.findSessions.mockResolvedValue([])
    const result = await dashboard()
    expect(result.attendanceTrend.currentEnrolledCount).toBe(774)
    expect(result.attendanceTrend.points[0]).toMatchObject({
      attendedCount: null, recordedCount: null, recordedClassCount: 0, attendanceRate: null,
    })
  })

  it('does not show present-day enrollment as historical enrollment', async () => {
    const result = await dashboard('?academicYearId=past')
    expect(result.attendanceTrend.currentEnrolledCount).toBeNull()
    expect(mocks.findClasses.mock.calls[1][0].where).not.toHaveProperty('isActive')
  })

  it('does not show child enrollment in the servant chart', async () => {
    mocks.findSessions.mockResolvedValue([
      { classId: 'class-0', date: new Date('2026-09-13'), servantAttendance: [{ status: 'PRESENT' }] },
    ])
    const result = await dashboard('?audience=servants')
    expect(result.attendanceTrend.currentEnrolledCount).toBeNull()
    expect(result.attendanceTrend.points[0]).toMatchObject({ recordedCount: 1, recordedClassCount: 1 })
  })

  it('uses only visible classes for both enrollment and submission coverage', async () => {
    mocks.visibleClassFilter.mockReturnValue(['class-0'])
    mocks.findClasses.mockResolvedValue([classes[0]])
    const result = await dashboard()
    expect(result.totals.children).toBe(300)
    expect(result.attendanceTrend.currentEnrolledCount).toBe(300)
    expect(result.attendanceTrend.classCount).toBe(1)
    expect(mocks.findClasses.mock.calls[1][0].where).toMatchObject({
      id: { in: ['class-0'] }, isActive: true,
    })
  })
})
