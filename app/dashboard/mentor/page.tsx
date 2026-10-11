'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Metric } from '@/components/ds/metric'
import { PersonCell } from '@/components/ds/person'
import { StatusBadge } from '@/components/ds/status-badge'
import { Legend } from '@/components/ds/stacked-bar'
import { useAcademicYears } from '@/lib/swr'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { canBeMentor } from '@/lib/roles'
import { useEnrollments, useClassAverages, useMenteeAnalytics } from '@/lib/swr'

interface ClassAverageSection {
  sectionId: string
  sectionName: string
  displayName: string
  average: number | null
  scoreCount: number
}

interface ClassAveragesData {
  sectionAverages: ClassAverageSection[]
  overallAverage: number | null
  totalStudents: number
  totalScores: number
}

interface StudentAnalytics {
  studentId: string
  studentName: string
  examAverage: number | null
  attendancePercentage: number | null
  attendanceMet: boolean
  examAverageMet: boolean
  graduationEligible: boolean
  sectionAverages: Record<string, number>
}

interface Enrollment {
  id: string
  studentId: string
  student: { id: string; name: string }
}

export default function MentorDashboard() {
  const { session, status } = useAdminGuard(canBeMentor)

  const userId = session?.user?.id
  const { data: enrollments } = useEnrollments(userId)
  const { data: classAverages, isLoading: classLoading } = useClassAverages()

  const menteeIds = useMemo(() => {
    if (!enrollments) return undefined
    const list = (enrollments as Enrollment[]).map((e: Enrollment) => e.studentId)
    return list.length > 0 ? list : undefined
  }, [enrollments])

  const { data: menteeAnalytics, isLoading: menteeLoading } = useMenteeAnalytics(menteeIds)

  // Compute mentee section averages
  const menteeSectionAverages = useMemo(() => {
    if (!menteeAnalytics || !Array.isArray(menteeAnalytics)) return {}
    const sectionTotals: Record<string, { sum: number; count: number }> = {}
    for (const student of menteeAnalytics as StudentAnalytics[]) {
      if (student.sectionAverages) {
        for (const [section, avg] of Object.entries(student.sectionAverages)) {
          if (!sectionTotals[section]) {
            sectionTotals[section] = { sum: 0, count: 0 }
          }
          sectionTotals[section].sum += avg
          sectionTotals[section].count += 1
        }
      }
    }
    const result: Record<string, number> = {}
    for (const [section, data] of Object.entries(sectionTotals)) {
      result[section] = data.sum / data.count
    }
    return result
  }, [menteeAnalytics])

  const menteeOverallExamAvg = useMemo(() => {
    if (!menteeAnalytics || !Array.isArray(menteeAnalytics)) return null
    const students = menteeAnalytics as StudentAnalytics[]
    const withScores = students.filter(s => s.examAverage !== null)
    if (withScores.length === 0) return null
    return withScores.reduce((sum, s) => sum + (s.examAverage ?? 0), 0) / withScores.length
  }, [menteeAnalytics])

  // Summary stats
  const menteeCount = menteeIds?.length ?? 0
  const onTrackCount = useMemo(() => {
    if (!menteeAnalytics || !Array.isArray(menteeAnalytics)) return 0
    return (menteeAnalytics as StudentAnalytics[]).filter(s => s.graduationEligible).length
  }, [menteeAnalytics])
  const atRiskCount = menteeCount - onTrackCount

  const isLoading = classLoading || menteeLoading
  const { data: years } = useAcademicYears(!!userId)

  if (status === 'loading') {
    return <PageLoading />
  }

  const classData = classAverages as ClassAveragesData | undefined
  const mentees = ((menteeAnalytics as StudentAnalytics[] | undefined) ?? []).slice().sort((a, b) => Number(a.graduationEligible) - Number(b.graduationEligible))
  const classAvg = classData?.overallAverage ?? null
  const diff = menteeOverallExamAvg !== null && classAvg !== null ? menteeOverallExamAvg - classAvg : null
  const yearName = years?.find((y) => y.isActive)?.name.replace('-', '–')

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Mentor dashboard"
        meta={[`Welcome back${session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}`, yearName]}
      />

      <KpiStrip
        items={[
          { label: 'Mentees', value: menteeCount, hint: 'assigned to you' },
          { label: 'On track', value: isLoading ? '—' : onTrackCount, hint: 'attendance + exams ≥ 75%' },
          { label: 'At risk', value: isLoading ? '—' : atRiskCount, hint: 'need a check-in', tone: !isLoading && atRiskCount > 0 ? 'bad' : undefined },
          {
            label: 'Mentees avg',
            value: menteeOverallExamAvg === null ? '—' : `${menteeOverallExamAvg.toFixed(1)}%`,
            hint: classAvg === null ? 'exam average' : `class avg ${classAvg.toFixed(1)}%`,
          },
          {
            label: 'Difference',
            value: diff === null ? '—' : `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}`,
            hint: 'vs. class',
            tone: diff === null || Math.abs(diff) < 0.5 ? undefined : diff > 0 ? 'ok' : 'bad',
          },
        ]}
      />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-2">
        <Panel
          title="Exam section averages"
          description="Class vs my mentees"
          actions={<Legend items={[{ label: 'Class', className: 'bg-ink-3' }, { label: 'My mentees', className: 'bg-accent-ink' }]} />}
        >
          {!classData || classData.sectionAverages.length === 0 ? (
            <EmptyState message={isLoading ? 'Loading section averages…' : 'No exam scores recorded yet.'} />
          ) : (
            <ul className="divide-y divide-line">
              {classData.sectionAverages.map((section) => {
                const mine = menteeSectionAverages[section.sectionName] ?? null
                const delta = mine !== null && section.average !== null ? mine - section.average : null
                const bar = (value: number | null, className: string) => (
                  <span aria-hidden className="block h-1.5 overflow-hidden rounded-[3px] bg-track">
                    <span className={`block h-full rounded-[3px] ${className}`} style={{ width: `${value ?? 0}%` }} />
                  </span>
                )
                return (
                  <li key={section.sectionId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 md:grid-cols-[180px_minmax(0,1fr)_64px]">
                    <span className="truncate text-[13px] text-ink">{section.displayName}</span>
                    <span className="order-3 col-span-2 flex flex-col gap-1.5 md:order-none md:col-span-1">
                      <span className="grid grid-cols-[minmax(0,1fr)_52px] items-center gap-2">
                        {bar(section.average, 'bg-ink-3')}
                        <span className="tabular text-right text-xs text-ink-3">{section.average === null ? '—' : `${section.average.toFixed(1)}%`}</span>
                      </span>
                      <span className="grid grid-cols-[minmax(0,1fr)_52px] items-center gap-2">
                        {bar(mine, 'bg-accent-ink')}
                        <span className="tabular text-right text-xs font-medium text-ink">{mine === null ? '—' : `${mine.toFixed(1)}%`}</span>
                      </span>
                    </span>
                    <span
                      className={`tabular text-right text-[13px] font-semibold ${delta === null || Math.abs(delta) < 0.5 ? 'text-ink-3' : delta > 0 ? 'text-ok' : 'text-bad'}`}
                    >
                      {delta === null ? '—' : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta).toFixed(1)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="My mentees"
          description={`${menteeCount} student${menteeCount === 1 ? '' : 's'}`}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/mentor/my-mentees">View mentees</Link>
            </Button>
          }
        >
          {menteeCount === 0 ? (
            <EmptyState title="No mentees yet" message="Ask an administrator to assign mentees to you." />
          ) : (
            <ul className="divide-y divide-line">
              {mentees.map((m) => (
                <li key={m.studentId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_120px_88px]">
                  <PersonCell name={m.studentName} href="/dashboard/mentor/my-mentees" />
                  <span className="order-3 md:order-none">
                    <Metric value={m.attendancePercentage} width={40} />
                  </span>
                  <span className="order-4 md:order-none">
                    <Metric value={m.examAverage} width={40} />
                  </span>
                  <span className="order-2 md:order-none">
                    {m.graduationEligible ? <StatusBadge tone="ok">On track</StatusBadge> : <StatusBadge tone="bad">At risk</StatusBadge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

    </div>
  )
}
