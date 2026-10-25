'use client'

import { useState } from 'react'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { SundaySchoolAttendanceChart } from '@/components/sunday-school-attendance-chart'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolDashboard } from '@/lib/swr'
import { formatUTC } from '@/lib/utils'
import type { SundaySchoolAttendanceAudience, SundaySchoolDashboard } from '@/types/sunday-school'

/**
 * Reports: the year-at-a-glance numbers and the attendance trend, moved off
 * Home so Home can stay about this week. Same dashboard data, same access.
 */
export default function SundaySchoolReportsPage() {
  const { status } = useSundaySchoolGuard()
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>()
  const [selectedClassId, setSelectedClassId] = useState<string>()
  const [audience, setAudience] = useState<SundaySchoolAttendanceAudience>('children')
  const { data, isLoading, isValidating } = useSundaySchoolDashboard(selectedAcademicYearId, selectedClassId, audience, {
    keepPreviousData: true,
  })
  const dashboard = data as SundaySchoolDashboard | undefined

  if (status === 'loading' || isLoading) return <PageLoading />

  const classes = dashboard?.classes ?? []
  const servants = new Set(classes.flatMap((c) => c.servants.map((sv) => sv.id))).size
  const withSessions = classes.filter((c) => c.sessionCount > 0)
  const totalKids = withSessions.reduce((n, c) => n + c.childCount, 0)
  const ytd = totalKids > 0 ? withSessions.reduce((n, c) => n + c.attendancePercentage * c.childCount, 0) / totalKids : null
  const trend = dashboard?.attendanceTrend
  const yearName = trend?.academicYears.find((y) => y.id === trend.selectedAcademicYearId)?.name.replace('-', '–')

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Reports" meta={[yearName, 'Attendance across the classes you can see']} />

      <KpiStrip
        items={[
          { label: 'Classes', value: dashboard?.totals.classes ?? 0, hint: `across ${dashboard?.ageGroups.length ?? 0} age groups` },
          { label: 'Children', value: dashboard?.totals.children ?? 0, hint: 'enrolled this year' },
          {
            label: 'Need attendance',
            value: dashboard?.totals.classesNeedingAttendance ?? 0,
            hint: dashboard?.weekOf ? `since ${formatUTC(dashboard.weekOf, { month: 'short', day: 'numeric' })}` : 'this week',
            tone: (dashboard?.totals.classesNeedingAttendance ?? 0) > 0 ? 'warn' : undefined,
          },
          { label: 'Attendance', value: ytd === null ? '—' : `${ytd.toFixed(0)}%`, hint: 'children, year to date' },
          { label: 'Servants', value: servants, hint: 'assigned to classes' },
        ]}
      />

      {trend ? (
        <SundaySchoolAttendanceChart
          trend={trend}
          selectedAcademicYearId={selectedAcademicYearId}
          selectedClassId={selectedClassId}
          audience={audience}
          onAcademicYearChange={(academicYearId) => {
            setSelectedAcademicYearId(academicYearId)
            setSelectedClassId(undefined)
            setAudience('children')
          }}
          onClassChange={setSelectedClassId}
          onAudienceChange={(next) => {
            setAudience(next)
            setSelectedClassId(undefined)
          }}
          isRefreshing={isValidating && !isLoading}
        />
      ) : (
        <Panel>
          <EmptyState message="No attendance has been recorded yet this year." />
        </Panel>
      )}
    </div>
  )
}
