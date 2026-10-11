'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Metric, metricTone } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import { PersonCell } from '@/components/ds/person'
import { Legend, StackedBarRow } from '@/components/ds/stacked-bar'
import {
  Agenda,
  EventLegend,
  MonthCalendar,
  nextDays,
  utcDayKey,
  type CalendarEvent,
} from '@/components/ds/calendar'
import { AttendanceTrendChart, ExamTrendChart, type AttendancePoint, type ExamPoint } from '@/components/admin/trend-charts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isAdmin, canAssignMentors } from '@/lib/roles'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { fetcher, useAcademicYears, useDashboardStats, useExams, useLessons } from '@/lib/swr'

interface ExamSectionScore {
  sectionId: string
  displayName: string
  average: number | null
  count: number
}

interface YearExamScores {
  yearId: string
  yearName: string
  isActive: boolean
  overallAverage: number | null
  sections: ExamSectionScore[]
}

interface YearAttendance {
  yearId: string
  yearName: string
  isActive: boolean
  present: number
  late: number
  absent: number
  excused: number
  total: number
  attendanceRate: number | null
}

interface AtRiskStudent {
  id: string
  name: string
  yearLevel: string
  attendanceRate: number | null
  examAverage: number | null
  issues: string[]
}

interface WeakSection {
  sectionId: string
  displayName: string
  average: number
  count: number
}

interface ProgramOverview {
  currentYearExams: number
  totalRelevantExams: number
  year1ExamsNeeded: number
  year2ExamsNeeded: number
  year1StudentCount: number
  year2StudentCount: number
  totalScoresRecorded: number
  overallProgramAverage: number | null
  studentsWithGoodAttendance: number
  studentsWithLowAttendance: number
  studentsWithGoodExams: number
  studentsWithLowExams: number
  studentsFullyOnTrack: number
  totalActiveStudents: number
  lessonCountByYear: Record<string, number>
  examCountByYear: Record<string, number>
  examScoresCountByYear: Record<string, number>
}

interface Analytics {
  examScoresByYear: YearExamScores[]
  attendanceByYear: YearAttendance[]
  atRiskStudents: AtRiskStudent[]
  weakestSections: WeakSection[]
  totalAtRisk: number
  programOverview: ProgramOverview
}

export default function AdminDashboard() {
  const { session, status } = useAdminGuard(isAdmin)
  const ready = status === 'authenticated'
  const { data: stats, isLoading } = useDashboardStats()
  const { data: analytics } = useSWR<Analytics>(ready ? '/api/dashboard/analytics' : null, fetcher)
  const { data: trends } = useSWR<{ attendance: AttendancePoint[]; exams: ExamPoint[] }>(
    ready ? '/api/dashboard/trends' : null,
    fetcher
  )
  const { data: years } = useAcademicYears(ready)
  const activeYear = years?.find((y) => y.isActive)
  const { data: lessons } = useLessons(activeYear?.id)
  const { data: exams } = useExams(activeYear?.id)
  const [month, setMonth] = useState(() => new Date())

  const events = useMemo<CalendarEvent[]>(() => {
    const lessonEvents: CalendarEvent[] = (lessons ?? []).map((l) => ({
      id: `lesson-${l.id}`,
      day: utcDayKey(l.scheduledDate),
      type: l.isExamDay ? 'exam' : 'prep-lesson',
      title: l.isExamDay ? `Exam day · ${l.title}` : `Lesson ${l.lessonNumber}`,
      meta: [l.title, l.speaker, l.status === 'CANCELLED' ? 'Cancelled' : l.status === 'NO_CLASS' ? 'No class' : null]
        .filter(Boolean)
        .join(' · '),
      href: `/dashboard/admin/attendance?lesson=${l.id}`,
      muted: l.status === 'CANCELLED' || l.status === 'NO_CLASS',
    }))
    const examEvents: CalendarEvent[] = (exams ?? []).map((e) => ({
      id: `exam-${e.id}`,
      day: utcDayKey(e.examDate),
      type: 'exam',
      title: e.examSection.displayName,
      meta: `${e.yearLevel === 'BOTH' ? 'Both years' : e.yearLevel.replace('YEAR_', 'Year ')} · out of ${e.totalPoints}`,
      href: `/dashboard/admin/exams?section=${e.examSection.id}`,
    }))
    return [...lessonEvents, ...examEvents]
  }, [lessons, exams])

  if (status === 'loading' || isLoading) {
    return <DashboardSkeleton />
  }

  const canAssign = session?.user?.role ? canAssignMentors(session.user.role) : false
  const overview = analytics?.programOverview
  const yearLabel = activeYear?.name.replace('-', '–')
  const examAvg = overview?.overallProgramAverage ?? null
  const atRisk = analytics?.atRiskStudents ?? []
  const agendaDays = nextDays(14)

  return (
    <div className="content-reveal flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        meta={['Servants Prep', yearLabel ? `${yearLabel} academic year` : null]}
        actions={
          <Button asChild>
            <Link href="/dashboard/admin/attendance">
              <ClipboardCheck />
              Take attendance
            </Link>
          </Button>
        }
      />

      <KpiStrip
        items={[
          { label: 'Active students', value: stats?.activeStudents ?? 0, hint: `of ${stats?.totalStudents ?? 0} enrolled` },
          {
            label: 'Year 1 · Year 2',
            value: (
              <>
                {overview?.year1StudentCount ?? 0}
                <span className="font-normal text-ink-3"> · </span>
                {overview?.year2StudentCount ?? 0}
              </>
            ),
            hint: overview && overview.year1StudentCount === 0 ? 'no Year 1 cohort yet' : 'active students',
          },
          {
            label: yearLabel ? `Lessons ${yearLabel}` : 'Lessons',
            value: (
              <>
                {stats?.completedLessons ?? 0}
                <span className="font-normal text-ink-3"> / {stats?.totalLessons ?? 0}</span>
              </>
            ),
            hint: `${stats?.upcomingLessons ?? 0} upcoming`,
          },
          { label: 'Exams', value: stats?.totalExams ?? 0, hint: `${overview?.totalScoresRecorded ?? 0} scores recorded` },
          {
            label: 'Program exam avg',
            value: examAvg === null ? '—' : `${examAvg.toFixed(1)}%`,
            hint: 'target ≥ 75%',
            tone: examAvg === null || examAvg >= 75 ? undefined : metricTone(examAvg) === 'bad' ? 'bad' : 'warn',
          },
          {
            label: 'Need support',
            value: analytics?.totalAtRisk ?? 0,
            hint: 'below 75% in either',
            tone: (analytics?.totalAtRisk ?? 0) > 0 ? 'bad' : undefined,
          },
        ]}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Calendar"
          actions={<EventLegend types={['prep-lesson', 'exam']} />}
          className="hidden md:block"
        >
          <MonthCalendar month={month} events={events} onMonthChange={setMonth} />
        </Panel>
        <Panel
          title="Next 14 days"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard/admin/curriculum">Full schedule</Link>
            </Button>
          }
        >
          <Agenda
            days={agendaDays}
            events={events}
            renderAction={(e) =>
              e.type === 'prep-lesson' && e.day === agendaDays.find((d) => events.some((x) => x.day === d && x.type === 'prep-lesson')) ? (
                <Button asChild size="sm">
                  <Link href={e.href ?? '/dashboard/admin/attendance'}>Take attendance</Link>
                </Button>
              ) : null
            }
          />
        </Panel>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <Panel
          title="Program readiness"
          description={`Year 2 · ${overview?.totalActiveStudents ?? 0} active`}
          actions={<Legend items={[{ label: '≥ 75%', className: 'bg-ok' }, { label: 'Below 75%', className: 'bg-bad' }]} />}
          footer="Graduation track requires both attendance and exam average at 75% or above."
        >
          {overview ? (
            <div className="py-1.5">
              <StackedBarRow
                label="Graduation track"
                good={overview.studentsFullyOnTrack}
                bad={overview.totalActiveStudents - overview.studentsFullyOnTrack}
                badLabel="need support"
              />
              <StackedBarRow
                label="Attendance"
                good={overview.studentsWithGoodAttendance}
                bad={overview.studentsWithLowAttendance}
              />
              <StackedBarRow label="Exam average" good={overview.studentsWithGoodExams} bad={overview.studentsWithLowExams} />
            </div>
          ) : (
            <EmptyState message="Loading readiness…" />
          )}
        </Panel>

        <Panel title="Year over year" footer="Lessons exclude exam days.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Lessons</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Exams</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Scores</TableHead>
                <TableHead>Attendance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(analytics?.attendanceByYear ?? []).map((year) => (
                <TableRow key={year.yearId}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-medium">
                      {year.yearName.replace('-', '–')}
                      {year.isActive && <StatusBadge tone="accent">Active</StatusBadge>}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{overview?.lessonCountByYear[year.yearId] ?? 0}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{overview?.examCountByYear[year.yearId] ?? 0}</TableCell>
                  <TableCell className="tabular hidden text-right sm:table-cell">{overview?.examScoresCountByYear[year.yearId] ?? 0}</TableCell>
                  <TableCell>
                    <Metric value={year.attendanceRate} width={48} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Panel
        title="Students needing support"
        description={`${analytics?.totalAtRisk ?? 0} students · sorted by attendance`}
        actions={
          (analytics?.totalAtRisk ?? 0) > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/admin/students?filter=review">View all {analytics?.totalAtRisk}</Link>
            </Button>
          ) : null
        }
      >
        {atRisk.length === 0 ? (
          <EmptyState title="Everyone is on track" message="No student is below 75% in attendance or exams." />
        ) : (
          <>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-20">Year</TableHead>
                  <TableHead className="w-44">Attendance</TableHead>
                  <TableHead className="w-44">Exam avg</TableHead>
                  <TableHead className="w-28">Flag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...atRisk]
                  .sort((a, b) => (a.attendanceRate ?? 0) - (b.attendanceRate ?? 0))
                  .slice(0, 8)
                  .map((student) => {
                    const lowAtt = (student.attendanceRate ?? 100) < 75
                    const lowExam = (student.examAverage ?? 100) < 75
                    return (
                      <TableRow key={student.id}>
                        <TableCell>
                          <PersonCell name={student.name} href={`/dashboard/admin/students?student=${student.id}`} />
                        </TableCell>
                        <TableCell className="text-ink-2">Year {student.yearLevel === 'YEAR_1' ? '1' : '2'}</TableCell>
                        <TableCell>
                          <Metric value={student.attendanceRate} />
                        </TableCell>
                        <TableCell>
                          <Metric value={student.examAverage} />
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={lowAtt && lowExam ? 'bad' : 'warn'}>
                            {lowAtt && lowExam ? 'Both' : lowAtt ? 'Attendance' : 'Exams'}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
            <ul className="divide-y divide-line md:hidden">
              {atRisk.slice(0, 5).map((student) => (
                <li key={student.id}>
                  <Link
                    href={`/dashboard/admin/students?student=${student.id}`}
                    className="flex min-h-14 items-center gap-3 px-4 py-2.5 text-ink no-underline"
                  >
                    <PersonCell
                      name={student.name}
                      meta={`Att ${student.attendanceRate?.toFixed(0) ?? '—'}% · Exam ${student.examAverage?.toFixed(0) ?? '—'}%`}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      {stats && stats.unassignedStudents > 0 && (
        <Panel>
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <StatusBadge tone="warn">Mentors</StatusBadge>
            <p className="text-[13px] text-ink-2">
              {stats.unassignedStudents} student{stats.unassignedStudents !== 1 ? 's' : ''}{' '}
              {stats.unassignedStudents !== 1 ? 'need' : 'needs'} a mentor.
            </p>
            {canAssign && (
              <Button asChild variant="outline" size="sm" className="ml-auto">
                <Link href="/dashboard/admin/enrollments">Assign mentors</Link>
              </Button>
            )}
          </div>
        </Panel>
      )}

      {analytics && analytics.examScoresByYear.length > 0 && (
        <SectionPerformance years={analytics.examScoresByYear} />
      )}

      {trends && (
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <AttendanceTrendChart data={trends.attendance} />
          <ExamTrendChart data={trends.exams} />
        </div>
      )}
    </div>
  )
}

/** Exam average per section across years; each links to that section's exams. */
function SectionPerformance({ years }: { years: YearExamScores[] }) {
  const sections = new Map<string, { id: string; name: string; total: number; weighted: number; perYear: { year: string; active: boolean; avg: number | null; count: number }[] }>()
  for (const year of years) {
    for (const s of year.sections) {
      const entry = sections.get(s.sectionId) ?? { id: s.sectionId, name: s.displayName, total: 0, weighted: 0, perYear: [] }
      entry.perYear.push({ year: year.yearName, active: year.isActive, avg: s.average, count: s.count })
      if (s.average !== null && s.count > 0) {
        entry.total += s.count
        entry.weighted += s.average * s.count
      }
      sections.set(s.sectionId, entry)
    }
  }
  const yearNames = years.map((y) => y.yearName)
  return (
    <Panel title="Exam performance by section" description="Weighted average across years · open a section to manage its exams">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Section</TableHead>
            <TableHead className="w-44">Overall</TableHead>
            {yearNames.map((y) => (
              <TableHead key={y} className="hidden w-32 text-right lg:table-cell">
                {y.replace('-', '–')}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...sections.values()].map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                <Link href={`/dashboard/admin/exams?section=${s.id}`} className="font-medium text-ink no-underline hover:underline">
                  {s.name}
                </Link>
                <span className="ml-2 text-xs text-ink-3">{s.total} scores</span>
              </TableCell>
              <TableCell>
                <Metric value={s.total > 0 ? s.weighted / s.total : null} />
              </TableCell>
              {yearNames.map((y) => {
                const entry = s.perYear.find((p) => p.year === y)
                return (
                  <TableCell key={y} className="tabular hidden text-right text-ink-2 lg:table-cell">
                    {entry?.avg !== null && entry?.avg !== undefined ? `${entry.avg.toFixed(1)}%` : '—'}
                    <span className="ml-1 text-xs text-ink-3">({entry?.count ?? 0})</span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  )
}
