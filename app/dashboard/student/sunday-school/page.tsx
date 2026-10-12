'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Metric } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import { formatUTC } from '@/lib/utils'
import { RotationFormUpload } from '@/components/rotation-form-upload'
import type { RotationFormSummary } from '@/types/rotation-forms'
import { CheckCircle, XCircle, MinusCircle, Clock } from 'lucide-react'

const GRADE_DISPLAY: Record<string, string> = {
  PRE_K: 'Pre-K',
  KINDERGARTEN: 'Kindergarten',
  GRADE_1: '1st Grade',
  GRADE_2: '2nd Grade',
  GRADE_3: '3rd Grade',
  GRADE_4: '4th Grade',
  GRADE_5: '5th Grade',
  GRADE_6_PLUS: '6th Grade+',
}

interface SSWeek {
  weekNumber: number
  weekOf: string
  status: 'VERIFIED' | 'MANUAL' | 'EXCUSED' | 'REJECTED' | null
}

interface SSAssignment {
  assignmentId: string
  class: { id: string; name: string } | null
  grade: string
  yearLevel: string | null
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
  rotationForm: RotationFormSummary | null
  weekBreakdown: SSWeek[]
}

interface SSProgress {
  studentId: string
  completedRotations: number
  requiredRotations: number
  assignments: SSAssignment[]
  graduation: {
    needsRotation: boolean
    allMet: boolean
  }
}

export default function SundaySchoolPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [progress, setProgress] = useState<SSProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoadError(false)
    try {
      const res = await fetch(`/api/sunday-school/progress?studentId=${session.user.id}`)
      if (!res.ok) throw new Error('Failed to load serving assignment')
      setProgress(await res.json())
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id])

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/login')
    else if (authStatus === 'authenticated' && session?.user?.role !== 'STUDENT') router.push('/dashboard')
    else if (authStatus === 'authenticated' && !session?.user?.isAsyncStudent) router.push('/dashboard/student')
  }, [authStatus, session, router])

  useEffect(() => {
    if (!session?.user?.id) return
    void fetchData()
    const refresh = () => void fetchData()
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [session?.user?.id, fetchData])

  const getWeekStatusIcon = (status: SSWeek['status']) => {
    switch (status) {
      case 'VERIFIED': return <CheckCircle className="size-5 text-ok" aria-hidden />
      case 'MANUAL': return <CheckCircle className="size-5 text-ok" aria-hidden />
      case 'EXCUSED': return <MinusCircle className="size-5 text-info" aria-hidden />
      case 'REJECTED': return <XCircle className="size-5 text-bad" aria-hidden />
      default: return <Clock className="size-5 text-ink-3" aria-hidden />
    }
  }

  const getWeekStatusLabel = (status: SSWeek['status']) => {
    switch (status) {
      case 'VERIFIED': return 'Verified'
      case 'MANUAL': return 'Approved'
      case 'EXCUSED': return 'Excused'
      case 'REJECTED': return 'Rejected'
      default: return 'Not submitted'
    }
  }

  if (loading || authStatus === 'loading') {
    return <PageLoading />
  }


  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Sunday School" meta={['Complete four signed weeks at each grade, from Pre-K through eighth grade']} back={{ href: '/dashboard/student', label: 'My progress' }} />

      {progress && <Panel title={`Rotations completed: ${progress.completedRotations ?? 0} of ${progress.requiredRotations ?? 10}`}>
        <p className="px-4 py-3 text-sm text-ink-2">{progress.graduation.allMet ? 'You have completed all ten grade rotations.' : 'Stay in your assigned class until all four weeks are signed and your form is approved.'}</p>
      </Panel>}

      {loadError ? (
        <Panel>
          <EmptyState title="Could not load your serving assignment" message="Please try again." />
          <div className="px-4 pb-4"><Button onClick={() => void fetchData()}>Try again</Button></div>
        </Panel>
      ) : !progress || progress.assignments.length === 0 ? (
        <Panel>
          <EmptyState title="No serving assignment yet" message="A Servants Prep servant assigns your Sunday School class. Ask them if you expected one." />
        </Panel>
      ) : (
        progress.assignments.map((assignment) => (
          <Panel
            key={assignment.assignmentId}
            title={assignment.isActive ? "Current rotation" : "Past rotation"}
            description={`${assignment.class?.name || GRADE_DISPLAY[assignment.grade] || assignment.grade} · ${assignment.academicYear.name}`}
            actions={assignment.isActive ? <StatusBadge tone="gold">Active</StatusBadge> : <StatusBadge tone="neutral">Finished</StatusBadge>}
          >
            <div className="flex flex-col gap-4 px-4 py-4">
              {assignment.attendance && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Metric
                    value={assignment.attendance.percentage}
                    detail={`${assignment.attendance.present} of ${assignment.totalWeeks} weeks verified`}
                    width={140}
                  />
                  {assignment.rotationForm?.status === 'APPROVED' ? <StatusBadge tone="ok">Rotation approved</StatusBadge> : <StatusBadge tone="warn">Four signed weeks required</StatusBadge>}
                </div>
              )}
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {assignment.weekBreakdown.map((week) => (
                  <li key={week.weekNumber} className="flex flex-col items-center gap-1.5 rounded-md border border-line px-2 py-3 text-center">
                    {getWeekStatusIcon(week.status)}
                    <span className="text-[12.5px] font-medium text-ink">
                      {formatUTC(week.weekOf, { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[11px] text-ink-3">{getWeekStatusLabel(week.status)}</span>
                  </li>
                ))}
              </ol>
            </div>
            <RotationFormUpload assignment={assignment} onUploaded={() => void fetchData()} />
          </Panel>
        ))
      )}
    </div>
  )
}
