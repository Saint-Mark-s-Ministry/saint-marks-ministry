import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SundaySchoolLevel } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  user: { id: 'servant-1', name: 'Jane Servant', role: 'SERVANT' },
  dashboard: {} as Record<string, unknown>,
  meeting: undefined as Record<string, unknown> | undefined,
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({
    status: 'authenticated',
    session: { user: mocks.user },
  }),
}))

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: mocks.user } }) }))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolAgeGroups: () => ({ data: mocks.dashboard.ageGroups }),
  useSundaySchoolMeetings: () => ({ data: mocks.meeting }),
  useLiturgicalCalendar: () => ({ data: undefined }),
  useLiturgicalDay: () => ({ data: undefined, isLoading: true }),
  useSundaySchoolLessons: () => ({ data: { lessons: [] } }),
  useSundaySchoolFollowUps: () => ({ data: undefined }),
  useSundaySchoolHomework: () => ({ data: undefined }),
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
    window.localStorage.clear()
    window.sessionStorage.clear()
    mocks.user = { id: 'servant-1', name: 'Jane Servant', role: 'SERVANT' }
    mocks.meeting = undefined
    mocks.dashboard = {
      classes: [classSummary('class-8', '8th Grade')],
      ageGroups: [],
      totals: { classes: 1, children: 12, classesNeedingAttendance: 1 },
      standing: { isAdmin: false, readOnly: false, coordinatesAnyAgeGroup: false },
      attendanceTrend: null,
    }
  })

  it('opens Father Isaac’s Home with High School instead of an old Elementary selection', () => {
    mocks.user = { id: 'isaac', name: 'Father Isaac', role: 'PRIEST' }
    window.localStorage.setItem('sunday-school.viewing', 'elementary-class')
    mocks.dashboard.classes = [
      { ...classSummary('elementary-class', '1st Grade'), level: SundaySchoolLevel.GRADE_1 },
      { ...classSummary('high-9', '9th Grade'), level: SundaySchoolLevel.GRADE_9 },
      { ...classSummary('high-10', '10th Grade'), level: SundaySchoolLevel.GRADE_10 },
    ]
    mocks.dashboard.ageGroups = [{ id: 'high', name: 'High School', overseerId: 'isaac', levels: [SundaySchoolLevel.GRADE_9, SundaySchoolLevel.GRADE_10] }]
    render(<SundaySchoolDashboardPage />)
    expect(screen.getByRole('link', { name: 'Children in 9th Grade' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Children in 10th Grade' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Children in 1st Grade' })).not.toBeInTheDocument()
  })

  it('gives a servant with one class a checklist for this week', () => {
    render(<SundaySchoolDashboardPage />)
    expect(screen.queryByRole('link', { name: 'Meeting check-in' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Take attendance' })).toHaveAttribute(
      'href',
      '/dashboard/servants/attendance?classId=class-8'
    )
    expect(screen.getByRole('link', { name: 'Open Care' })).toHaveAttribute('href', '/dashboard/servants/care')
    // A servant with one class has no class list to manage.
    expect(screen.queryByRole('heading', { name: 'Classes' })).not.toBeInTheDocument()
  })

  it('sends coordinators with several classes to the attendance picker and lists what is due', () => {
    mocks.dashboard = {
      ...mocks.dashboard,
      classes: [classSummary('class-7', '7th Grade'), classSummary('class-8', '8th Grade')],
      totals: { classes: 2, children: 24, classesNeedingAttendance: 2 },
    }
    render(<SundaySchoolDashboardPage />)
    expect(screen.getByRole('link', { name: 'Take attendance' })).toHaveAttribute('href', '/dashboard/servants/attendance')
    expect(screen.getByRole('link', { name: 'Children in 8th Grade' })).toHaveAttribute('href', '/dashboard/servants/roster?classId=class-8')
    expect(screen.getAllByRole('link', { name: 'Take' }).map((l) => l.getAttribute('href'))).toEqual([
      '/dashboard/servants/attendance?classId=class-7',
      '/dashboard/servants/attendance?classId=class-8',
    ])
  })
  it('links ordinary Elementary servants straight to self check-in without mounting the meeting roster', () => {
    mocks.dashboard.classes = [{ ...classSummary('elementary-class', '1st Grade'), level: SundaySchoolLevel.GRADE_1, ageGroup: { id: 'elementary', name: 'Elementary School' } }]
    mocks.dashboard.ageGroups = [{ id: 'elementary', name: 'Elementary School', levels: [SundaySchoolLevel.GRADE_1], canCoordinate: false }]
    mocks.meeting = { canCheckIn: true, meeting: { id: 'today', date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()) } }
    render(<SundaySchoolDashboardPage />)
    expect(screen.getByRole('link', { name: 'Meeting check-in' })).toHaveAttribute('href', '/dashboard/servants/servant-attendance/meetings?ageGroupId=elementary&meetingId=today')
    expect(screen.queryByRole('region', { name: 'Servants meetings' })).not.toBeInTheDocument()
  })

})
