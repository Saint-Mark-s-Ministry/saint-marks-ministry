import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SundaySchoolDashboard } from '@/types/sunday-school'

const chart = vi.hoisted(() => ({ data: vi.fn() }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children, data }: { children: ReactNode; data: unknown }) => {
    chart.data(data)
    return <div>{children}</div>
  },
  Line: ({ name }: { name: string }) => <span data-testid="chart-line">{name}</span>,
  CartesianGrid: () => null,
  Legend: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

import { SundaySchoolAttendanceChart } from '@/components/sunday-school-attendance-chart'
import { SundaySchoolRecentAttendanceChart } from '@/components/sunday-school-recent-attendance-chart'

function makeTrend(): SundaySchoolDashboard['attendanceTrend'] {
  return {
    audience: 'children', currentEnrolledCount: 774, classCount: 12,
    points: [
      { date: '2026-09-13', attendedCount: 100, recordedCount: 300, recordedClassCount: 4, attendanceRate: 33.3 },
      { date: '2026-09-20', attendedCount: null, recordedCount: null, recordedClassCount: 0, attendanceRate: null },
    ],
    academicYears: [{ id: 'year', name: '2026-2027' }], classes: [],
    selectedAcademicYearId: 'year', selectedClassId: null, canSelectClass: false,
    canViewServantAttendance: false, meetingDayLabel: 'week',
    startDate: '2026-09-13', endDate: '2026-09-20',
  }
}
function renderChart(trend = makeTrend()) {
  return render(<SundaySchoolAttendanceChart
    trend={trend} audience="children"
    onAcademicYearChange={vi.fn()} onClassChange={vi.fn()} onAudienceChange={vi.fn()}
  />)
}

describe('Sunday School attendance chart counts', () => {
  it('distinguishes current enrollment from the changing number of saved attendance marks', () => {
    renderChart()
    expect(screen.getByText('774')).toBeInTheDocument()
    expect(screen.getByText('100 attended / 300 recorded')).toBeInTheDocument()
    expect(screen.getByText('4 of 12 classes with records in the latest recorded week')).toBeInTheDocument()
    expect(screen.queryByText('On roster')).not.toBeInTheDocument()
    expect(screen.queryByText('Current enrolled', { selector: '[data-testid=chart-line]' })).not.toBeInTheDocument()
    expect(screen.queryByText(/The dashed line shows/)).not.toBeInTheDocument()
    expect(chart.data).toHaveBeenLastCalledWith([
      expect.objectContaining({ recordedCount: 300 }),
      expect.objectContaining({ recordedCount: null, attendedCount: null }),
    ])
  })

  it('shows enrollment even when all weeks are unrecorded without implying zero attendance', () => {
    const trend = makeTrend()
    trend.points = [trend.points[1]]
    renderChart(trend)
    expect(screen.getByText('774')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText(/attended \/ .* recorded/)).not.toBeInTheDocument()
  })

  it('omits the current roster explanation for historical charts', () => {
    const trend = makeTrend()
    trend.currentEnrolledCount = null
    renderChart(trend)
    expect(screen.queryByText('774')).not.toBeInTheDocument()
    expect(screen.queryByText(/The dashed line shows/)).not.toBeInTheDocument()
  })

  it('keeps recorded-attendance labels without an enrollment line in the recent chart', () => {
    render(<SundaySchoolRecentAttendanceChart
      trend={makeTrend()} className="Sixth Grade" throughDate="2026-09-20"
    />)
    expect(screen.getByText('Attendance recorded')).toBeInTheDocument()
    expect(screen.queryByText('On roster')).not.toBeInTheDocument()
    expect(screen.queryByText('Current enrolled', { selector: '[data-testid=chart-line]' })).not.toBeInTheDocument()
    expect(screen.queryByText(/The dashed line shows/)).not.toBeInTheDocument()
    expect(chart.data).toHaveBeenLastCalledWith([
      expect.objectContaining({ recordedCount: 300 }),
      expect.objectContaining({ recordedCount: null }),
    ])
  })
})
