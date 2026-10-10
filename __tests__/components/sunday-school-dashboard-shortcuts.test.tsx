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
  useSundaySchoolLessons: () => ({ data: { lessons: [] } }),
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

  it('sends Take attendance straight to the only assigned class', () => {
    render(<SundaySchoolDashboardPage />)
    expect(screen.getByRole('link', { name: 'Take attendance' })).toHaveAttribute(
      'href',
      '/dashboard/servants/attendance?classId=class-8'
    )
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('href', '/dashboard/servants/roster?classId=class-8')
  })

  it('sends coordinators with several classes to the attendance picker and lists what is due', () => {
    mocks.dashboard = {
      ...mocks.dashboard,
      classes: [classSummary('class-7', '7th Grade'), classSummary('class-8', '8th Grade')],
      totals: { classes: 2, children: 24, classesNeedingAttendance: 2 },
    }
    render(<SundaySchoolDashboardPage />)
    expect(screen.getByRole('link', { name: 'Take attendance' })).toHaveAttribute('href', '/dashboard/servants/attendance')
    expect(screen.getAllByRole('link', { name: 'Take' }).map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/servants/attendance?classId=class-7',
      '/dashboard/servants/attendance?classId=class-8',
    ])
  })
  it('does not put meeting attendance on the Elementary dashboard', () => {
    mocks.dashboard.classes = [{ ...classSummary('elementary-class', '1st Grade'), level: SundaySchoolLevel.GRADE_1, ageGroup: { id: 'elementary', name: 'Elementary School' } }]
    mocks.dashboard.ageGroups = [{ id: 'elementary', name: 'Elementary School', levels: [SundaySchoolLevel.GRADE_1], canCoordinate: false }]
    render(<SundaySchoolDashboardPage />)
    expect(screen.queryByText(/servants meetings/i)).not.toBeInTheDocument()
  })

})
