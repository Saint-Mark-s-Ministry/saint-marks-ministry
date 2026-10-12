'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { formatUTC } from '@/lib/utils'
import { RotationFormUpload } from '@/components/rotation-form-upload'
import type { RotationFormSummary } from '@/types/rotation-forms'
import { rotationWeekDate } from '@/lib/rotation-forms'

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

interface SSAssignment {
  assignmentId: string
  class: { id: string; name: string } | null
  grade: string
  yearLevel: string | null
  academicYear: { id: string; name: string }
  totalWeeks: number
  startDate: string
  isActive: boolean
  rotationForm: RotationFormSummary | null
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
            actions={<StatusBadge tone={assignment.rotationForm?.status === 'APPROVED' ? 'ok' : assignment.rotationForm?.status === 'REJECTED' ? 'bad' : assignment.rotationForm?.status === 'PENDING' ? 'warn' : 'neutral'}>{assignment.rotationForm?.status === 'APPROVED' ? 'Approved' : assignment.rotationForm?.status === 'REJECTED' ? 'Changes requested' : assignment.rotationForm?.status === 'PENDING' ? 'Awaiting review' : 'Not submitted'}</StatusBadge>}
          >
            <p className="px-4 py-3 text-sm text-ink-2">
              Four-week rotation: {formatUTC(assignment.startDate, { month: 'short', day: 'numeric', year: 'numeric' })}
              {' – '}{formatUTC(rotationWeekDate(assignment.startDate, assignment.totalWeeks), { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
            <RotationFormUpload assignment={assignment} onUploaded={() => void fetchData()} />
          </Panel>
        ))
      )}
    </div>
  )
}
