import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SundaySchoolLevel } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  dashboard: {} as Record<string, unknown>,
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({
    status: 'authenticated',
    session: { user: { id: 'servant-1', name: 'Jane Servant' } },
  }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolDashboard: () => ({
    data: mocks.dashboard,
    isLoading: false,
    isValidating: false,
  }),
}))

vi.mock('@/components/sunday-school-attendance-chart', () => ({
  SundaySchoolAttendanceChart: () => null,
}))

import SundaySchoolDashboardPage from '@/app/dashboard/servants/page'

function classSummary(id: string, name: string) {
  return {
    id,
    name,
    level: SundaySchoolLevel.GRADE_8,
    ageGroup: null,
    childCount: 12,
    sessionCount: 0,
    attendancePercentage: 0,
    latestSession: null,
    attendanceTakenThisWeek: false,
    canServe: true,
    canCoordinate: false,
    servants: [],
  }
}

describe('Sunday School dashboard shortcuts', () => {
  beforeEach(() => {
    mocks.dashboard = {
      classes: [classSummary('class-8', '8th Grade')],
      ageGroups: [],
      totals: { classes: 1, children: 12, classesNeedingAttendance: 1 },
      standing: { isAdmin: false, readOnly: false, coordinatesAnyAgeGroup: false },
      attendanceTrend: null,
    }
  })

  it('links all three summary cards directly to the only assigned class', () => {
    render(<SundaySchoolDashboardPage />)

    expect(screen.getByRole('link', { name: '1 Class. Open 8th Grade' }))
      .toHaveAttribute('href', '/dashboard/servants/classes/class-8')
    expect(screen.getByRole('link', { name: '12 Children. Open 8th Grade roster' }))
      .toHaveAttribute('href', '/dashboard/servants/roster?classId=class-8')
    expect(screen.getByRole('link', { name: '1 Need attendance this week. Take 8th Grade attendance' }))
      .toHaveAttribute('href', '/dashboard/servants/attendance?classId=class-8')
  })

  it('links coordinators with multiple classes to the corresponding list pages', () => {
    mocks.dashboard = {
      ...mocks.dashboard,
      classes: [classSummary('class-7', '7th Grade'), classSummary('class-8', '8th Grade')],
      totals: { classes: 2, children: 24, classesNeedingAttendance: 2 },
    }

    render(<SundaySchoolDashboardPage />)

    expect(screen.getByRole('link', { name: '2 Classes. View all classes' }))
      .toHaveAttribute('href', '/dashboard/servants/classes')
    expect(screen.getByRole('link', { name: '24 Children. Open rosters' }))
      .toHaveAttribute('href', '/dashboard/servants/roster')
    expect(screen.getByRole('link', { name: '2 Need attendance this week. Open attendance' }))
      .toHaveAttribute('href', '/dashboard/servants/attendance')
  })
})
