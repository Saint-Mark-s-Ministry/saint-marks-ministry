import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ classes: [] as Array<Record<string, unknown>> }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated' }) }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolDashboard: () => ({ data: { classes: mocks.classes, ageGroups: [], totals: { classes: mocks.classes.length, children: 310, classesNeedingAttendance: 0 } } }) }))
vi.mock('@/components/sunday-school-attendance-chart', () => ({ SundaySchoolAttendanceChart: () => null }))

import ReportsPage from '@/app/dashboard/servants/reports/page'

describe('Sunday School Reports attendance average', () => {
  beforeEach(() => { mocks.classes = [] })

  it('weights eligible marks, without letting an excluded-only class lower the average', () => {
    mocks.classes = [
      { servants: [], sessionCount: 2, childCount: 10, countableAttendanceCount: 3, attendancePercentage: 50 },
      { servants: [], sessionCount: 1, childCount: 100, countableAttendanceCount: 1, attendancePercentage: 100 },
      { servants: [], sessionCount: 1, childCount: 200, countableAttendanceCount: 0, attendancePercentage: 0 },
    ]
    render(<ReportsPage />)
    expect(screen.getByText('63%')).toBeInTheDocument()
  })

  it('shows no average when there are no eligible marks', () => {
    mocks.classes = [{ servants: [], sessionCount: 1, childCount: 20, countableAttendanceCount: 0, attendancePercentage: 0 }]
    render(<ReportsPage />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
  })
})
