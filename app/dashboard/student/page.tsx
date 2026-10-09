'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DashboardSkeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Metric, metricTone } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import { KeyValueList } from '@/components/ds/kv-list'
import { cn } from '@/lib/utils'
import { SECTION_DISPLAY_NAMES } from '@/lib/constants'
import type { AttendanceAnalytics, ExamAnalytics, GraduationStatus } from '@/lib/types'
import { getAttendanceGuidance, getExamGuidance } from '@/lib/graduation-guidance'
import { BookOpen, Check, ClipboardCheck, Printer, X } from 'lucide-react'

interface Analytics {
  enrollment: {
    id: string
    yearLevel: 'YEAR_1' | 'YEAR_2'
    isActive: boolean
    isAsyncStudent: boolean
    status: string
    mentor: {
      id: string
      name: string
      email: string
      phone: string | null
    } | null
    fatherOfConfession: {
      id: string
      name: string
      phone: string | null
      church: string | null
    } | null
    student: {
      id: string
      name: string
      email: string
    }
  }
  attendance: AttendanceAnalytics
  exams: ExamAnalytics
  graduation: GraduationStatus
  sundaySchool?: {
    assignments: Array<{
      id: string
      grade: string
      yearLevel: string
      academicYear: { id: string; name: string }
      totalWeeks: number
      startDate: string
      isActive: boolean
      attendance: {
        present: number
        excused: number
        absent: number
        effectiveTotal: number
        percentage: number
        met: boolean
      } | null
    }>
    year1Met: boolean
    year2Met: boolean
    /** No active rotation for the current year yet. */
    needsRotation?: boolean
    allMet: boolean
  }
}

export default function StudentDashboard() {
  const { session, status } = useAdminGuard(isStudent)
  const router = useRouter()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setAcademicYearId] = useState<string | null>(null)
  const [academicYearName, setAcademicYearName] = useState<string>('')

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user?.id) return

      try {
        // Get active academic year
        const yearsRes = await fetch('/api/academic-years')
        const years = await yearsRes.json()
        const activeYear = years.find((y: { isActive: boolean }) => y.isActive)

        if (activeYear) {
          setAcademicYearId(activeYear.id)
          setAcademicYearName(activeYear.name)
        }

        // Fetch analytics (no academicYearId filter - aggregate across ALL years for graduation tracking)
        const analyticsRes = await fetch(
          `/api/students/${session.user.id}/analytics`
        )

        if (analyticsRes.ok) {
          const data = await analyticsRes.json()
          setAnalytics(data)
        }
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user) {
      fetchData()
    }
  }, [session])

  if (loading || status === 'loading') {
    return <DashboardSkeleton />
  }

  if (!analytics) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader title={`Hi${session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}`} meta={['Servants Prep']} />
        <Panel>
          <EmptyState title="No enrollment yet" message="You aren’t enrolled in the current academic year. If you think that’s a mistake, contact a Servants Prep leader." />
        </Panel>
      </div>
    )
  }

  const { enrollment, attendance: att, exams, graduation } = analytics
  const isAsync = enrollment.isAsyncStudent
  const firstName = (enrollment.student.name || session?.user?.name || '').split(' ')[0]
  const att2 = getAttendanceGuidance(att)
  const ex2 = getExamGuidance(exams)
  const na = (att.notEnrolledYetCount ?? 0) + (att.expectedAbsenceNACount ?? 0)
  const guidanceTone = (status: string) =>
    status === 'failing' ? 'bg-bad-tint text-bad' : status === 'at-risk' ? 'bg-warn-tint text-warn' : status === 'on-track' ? 'bg-ok-tint text-ok' : 'bg-hover text-ink-2'
  const requirements = [
    { label: 'Attendance ≥ 75%', met: graduation.attendanceMet },
    { label: 'Exam avg ≥ 75%', met: graduation.overallAverageMet },
    { label: 'All sections ≥ 60%', met: graduation.allSectionsPassing },
    ...(isAsync && graduation.sundaySchoolMet !== undefined
      ? [{
          label: analytics.sundaySchool?.needsRotation ? 'Sunday School rotation · not assigned yet' : 'Sunday School rotation ≥ 75%',
          met: graduation.sundaySchoolMet,
        }]
      : []),
  ]
  // The rotation that counts: this year's active one
  const assignment =
    analytics.sundaySchool?.assignments.find((a) => a.isActive && a.yearLevel === enrollment.yearLevel) ??
    analytics.sundaySchool?.assignments[0]

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={`Hi, ${firstName}`}
        meta={[`Year ${enrollment.yearLevel === 'YEAR_1' ? '1' : '2'}`, isAsync ? 'Async student' : 'Servants Prep', academicYearName.replace('-', '–')]}
        actions={
          <>
            <Button variant="outline" onClick={() => router.push('/dashboard/student/lessons')}>
              <BookOpen />
              My lessons
            </Button>
            <Button variant="outline" onClick={() => router.push('/dashboard/student/makeup-exams')}>
              Makeup exams
            </Button>
            {isAsync && (
              <Button onClick={() => router.push('/dashboard/student/attendance-slip')}>
                <Printer />
                Print attendance slip
              </Button>
            )}
          </>
        }
      />

      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="Graduation track"
            description={`Year ${enrollment.yearLevel === 'YEAR_1' ? '1' : '2'}${academicYearName ? ` · ${academicYearName.replace('-', '–')}` : ''}`}
            actions={graduation.eligible ? <StatusBadge tone="ok">On track</StatusBadge> : <StatusBadge tone="bad">Needs attention</StatusBadge>}
          >
            <div className="grid gap-5 px-4 py-4 sm:grid-cols-2">
              <GoalBar label="Attendance" value={att.percentage} detail={`${att.effectivePresent.toFixed(1)} of ${att.totalLessons} lessons`} goal={att.required} />
              <GoalBar
                label="Exam average"
                value={exams.overallAverage}
                detail={`${exams.examsTaken} of ${exams.totalApplicableExams} exams`}
                goal={exams.requiredAverage}
              />
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-4 py-2.5">
              {requirements.map((r) => (
                <li key={r.label} className={cn('inline-flex items-center gap-1.5 text-[12.5px]', r.met ? 'text-ok' : 'text-bad')}>
                  {r.met ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <X className="size-3.5" strokeWidth={2.5} aria-hidden />}
                  <span className="text-ink-2">{r.label}</span>
                  <span className="sr-only">{r.met ? 'met' : 'not met'}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="What to do next" description="Based on your current progress">
            <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
              {[
                { label: 'Attendance', g: att2 },
                { label: 'Exam average', g: ex2 },
              ].map(({ label, g }) => (
                <div key={label} className={cn('rounded-md px-3 py-2.5', guidanceTone(g.status))}>
                  <div className="text-[11px] font-semibold tracking-[0.06em] uppercase opacity-80">{label}</div>
                  <div className="mt-0.5 text-[13.5px] font-medium">{g.message}</div>
                  {g.detail && <div className="mt-0.5 text-xs opacity-90">{g.detail}</div>}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Attendance" description="Late counts as half · two lates equal one absence · excused days don’t count against you">
            <dl className="tabular grid grid-cols-3 gap-px bg-line sm:grid-cols-6">
              {[
                ['Present', att.presentCount, 'text-ok'],
                ['Late', att.lateCount, 'text-warn'],
                ['Absent', att.absentCount, 'text-bad'],
                ['Excused', att.excusedCount - na, 'text-info'],
                ['N/A', na, 'text-ink-3'],
                ['Total', att.allLessons, 'text-ink'],
              ].map(([label, value, ink]) => (
                <div key={label as string} className="flex flex-col gap-0.5 bg-surface px-4 py-3">
                  <dt className="text-xs text-ink-3">{label as string}</dt>
                  <dd className={cn('text-2xl font-semibold', ink as string)}>{value as number}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Exams" description={`${exams.examsTaken} of ${exams.totalApplicableExams} taken · every section needs 60% or more`}>
            {exams.sectionAverages.length === 0 ? (
              <EmptyState message="No exam scores yet." />
            ) : (
              <ul className="divide-y divide-line">
                {exams.sectionAverages.map((section) => (
                  <li key={section.section} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="min-w-0 truncate">{SECTION_DISPLAY_NAMES[section.section] || section.section}</span>
                    <Metric value={section.average} target={60} floor={50} />
                  </li>
                ))}
              </ul>
            )}
            {exams.missingExams?.length > 0 && (
              <div className="border-t border-line px-4 py-3">
                <h3 className="mb-1.5 text-xs font-medium text-warn">Not taken yet ({exams.missingExams.length})</h3>
                <ul className="flex flex-col gap-1">
                  {exams.missingExams.map((exam) => (
                    <li key={exam.id} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="truncate">{exam.sectionDisplayName}</span>
                      <span className="text-xs text-ink-3">
                        {new Date(exam.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Your people">
            <div className="px-4 py-1">
              <KeyValueList
                items={[
                  {
                    label: 'Mentor',
                    value: enrollment.mentor ? (
                      <span className="flex flex-col">
                        {enrollment.mentor.name}
                        {enrollment.mentor.email && <a href={`mailto:${enrollment.mentor.email}`} className="text-xs text-accent-ink">{enrollment.mentor.email}</a>}
                        {enrollment.mentor.phone && <a href={`tel:${enrollment.mentor.phone}`} className="font-mono text-xs text-accent-ink">{enrollment.mentor.phone}</a>}
                      </span>
                    ) : (
                      <span className="text-ink-3">Not assigned yet</span>
                    ),
                  },
                  {
                    label: 'Father of confession',
                    value: enrollment.fatherOfConfession ? (
                      <span className="flex flex-col">
                        {enrollment.fatherOfConfession.name}
                        {enrollment.fatherOfConfession.church && <span className="text-xs text-ink-3">{enrollment.fatherOfConfession.church}</span>}
                        {enrollment.fatherOfConfession.phone && (
                          <a href={`tel:${enrollment.fatherOfConfession.phone}`} className="font-mono text-xs text-accent-ink">{enrollment.fatherOfConfession.phone}</a>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-3">Not set</span>
                    ),
                  },
                  {
                    label: 'Sunday School',
                    value: isAsync ? (assignment ? `Serving · ${assignment.academicYear.name}` : 'Not assigned yet') : <span className="text-ink-3">Not required · in-person student</span>,
                  },
                ]}
              />
            </div>
          </Panel>

          {isAsync && (
            <Panel
              title="Sunday School serving"
              description="Async students serve six weeks in Sunday School"
              actions={
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/student/sunday-school">
                    <ClipboardCheck />
                    Open
                  </Link>
                </Button>
              }
            >
              {analytics.sundaySchool && analytics.sundaySchool.assignments.length > 0 ? (
                <ul className="divide-y divide-line">
                  {analytics.sundaySchool.assignments.map((a) => (
                    <li key={a.id} className="flex flex-col gap-1.5 px-4 py-3">
                      <span className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="font-medium text-ink">
                          {a.grade.replace('GRADE_', 'Grade ').replace('_PLUS', '+').replace('PRE_K', 'Pre-K').replace('KINDERGARTEN', 'Kindergarten')} ·{' '}
                          {a.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}
                        </span>
                        {a.attendance?.met ? <StatusBadge tone="ok">Met</StatusBadge> : <StatusBadge tone="warn">In progress</StatusBadge>}
                      </span>
                      <Metric value={a.attendance?.percentage ?? null} detail={a.attendance ? `${a.attendance.present} of ${a.totalWeeks} weeks` : undefined} width={96} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No serving assignment yet. A leader will assign your class." />
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

/** A percentage bar with the goal marked on it (student boards: "Goal 75%"). */
function GoalBar({ label, value, detail, goal }: { label: string; value: number | null; detail: string; goal: number }) {
  const tone = value === null ? null : metricTone(value, goal)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink-3">{label}</span>
        <span className="text-xs text-ink-3">Goal {goal}%</span>
      </div>
      <span className={cn('tabular text-[28px] leading-none font-semibold tracking-[-0.02em]', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>
        {value === null ? '—' : `${value.toFixed(1)}%`}
      </span>
      <span aria-hidden className="relative block h-2 rounded-[3px] bg-track">
        <span
          className={cn('block h-full rounded-[3px]', tone === 'bad' ? 'bg-bad' : tone === 'warn' ? 'bg-warn' : 'bg-ok')}
          style={{ width: `${Math.min(100, value ?? 0)}%` }}
        />
        <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-ink" style={{ left: `${goal}%` }} />
      </span>
      <span className="text-xs text-ink-3">{detail}</span>
    </div>
  )
}
