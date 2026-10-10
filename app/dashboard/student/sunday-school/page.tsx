'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Metric } from '@/components/ds/metric'
import { StatusBadge } from '@/components/ds/status-badge'
import { toast } from 'sonner'
import { CheckCircle, XCircle, MinusCircle, Clock, KeyRound } from 'lucide-react'

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
  weeks: SSWeek[]
}

interface SSProgress {
  studentId: string
  assignments: SSAssignment[]
  graduation: {
    year1Met: boolean
    year2Met: boolean
    allMet: boolean
  }
}

export default function SundaySchoolPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [progress, setProgress] = useState<SSProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return
    try {
      const res = await fetch(`/api/sunday-school/progress?studentId=${session.user.id}`)
      if (res.ok) {
        setProgress(await res.json())
      }
    } catch {
      toast.error('Failed to load data')
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
    if (session?.user) fetchData()
  }, [session?.user, fetchData])

  const handleSubmitCode = async () => {
    if (!code.trim()) {
      toast.error('Please enter a code')
      return
    }
    setSubmitting(true)
    try {
      const now = new Date()
      const day = now.getDay()
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - day)
      weekStart.setHours(0, 0, 0, 0)

      const res = await fetch('/api/sunday-school/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), weekOf: weekStart.toISOString() })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to submit code')
      }

      toast.success('Attendance logged successfully!')
      setCode('')
      fetchData()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit code')
    } finally {
      setSubmitting(false)
    }
  }

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
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Sunday School" meta={['Track your weekly Sunday School serving']} back={{ href: '/dashboard/student', label: 'My progress' }} />

      {!progress || progress.assignments.length === 0 ? (
        <Panel>
          <EmptyState title="No serving assignment yet" message="A Servants Prep servant assigns your Sunday School class. Ask them if you expected one." />
        </Panel>
      ) : (
        progress.assignments.map((assignment) => (
          <Panel
            key={assignment.id}
            title="Serving stint"
            description={`${GRADE_DISPLAY[assignment.grade] || assignment.grade} · ${assignment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} · ${assignment.academicYear.name}`}
            actions={assignment.isActive ? <StatusBadge tone="gold">Active</StatusBadge> : <StatusBadge tone="neutral">Finished</StatusBadge>}
          >
            <div className="flex flex-col gap-4 px-4 py-4">
              {assignment.attendance && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Metric
                    value={assignment.attendance.percentage}
                    detail={`${assignment.attendance.present} of ${assignment.attendance.effectiveTotal} weeks`}
                    width={140}
                  />
                  {assignment.attendance.met ? <StatusBadge tone="ok">Requirement met</StatusBadge> : <StatusBadge tone="warn">Need 75%</StatusBadge>}
                </div>
              )}
              <ol className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {assignment.weeks.map((week) => (
                  <li key={week.weekNumber} className="flex flex-col items-center gap-1.5 rounded-md border border-line px-2 py-3 text-center">
                    {getWeekStatusIcon(week.status)}
                    <span className="text-[12.5px] font-medium text-ink">
                      {new Date(week.weekOf).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-[11px] text-ink-3">{getWeekStatusLabel(week.status)}</span>
                  </li>
                ))}
              </ol>
            </div>
            {assignment.isActive && (
              <form
                className="flex flex-col gap-2 border-t border-line px-4 py-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  void handleSubmitCode()
                }}
              >
                <label htmlFor={`code-${assignment.id}`} className="text-sm font-semibold text-ink">
                  Submit attendance code
                </label>
                <p className="text-xs text-ink-3">Enter the verification code your Sunday School servant gave you.</p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id={`code-${assignment.id}`}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g., G2-A7X3"
                    autoComplete="off"
                    maxLength={10}
                    className="w-40 font-mono tracking-wider"
                  />
                  <Button type="submit" disabled={submitting || !code.trim()}>
                    <KeyRound />
                    {submitting ? 'Verifying…' : 'Submit code'}
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        ))
      )}
    </div>
  )
}
