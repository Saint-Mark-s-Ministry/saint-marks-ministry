'use client'

import { use } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'
import { useStudentDetails, useStudentServingProgress } from '@/lib/swr'
import { calculateAttendanceFromRecords } from '@/lib/attendance-utils'
import { StudentDetailsModal } from '@/components/student-details-modal'
import { AsyncBadge } from '@/components/async-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageLoading } from '@/components/ui/page-loading'

export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, status } = useAdminGuard(isAdmin)
  const allowed = status === 'authenticated' && !!session?.user?.role && isAdmin(session.user.role)
  const { data, error, isLoading, mutate } = useStudentDetails(allowed ? id : undefined)

  const asyncStudent = !!data?.student.enrollments?.[0]?.isAsyncStudent
  const serving = useStudentServingProgress(allowed && asyncStudent ? id : undefined)

  if (!allowed || isLoading) return <PageLoading />

  const back = <Link href="/dashboard/admin/students" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"><ArrowLeft className="h-4 w-4" />All students</Link>
  if (error || !data) {
    const errorStatus = (error as { status?: number } | undefined)?.status
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
        {back}
        <div role="alert" className="space-y-3 rounded-lg border p-6">
          <h1 className="text-xl font-semibold">{errorStatus === 404 ? 'Student not found' : errorStatus === 403 ? 'You do not have access to this student' : 'Unable to load student profile'}</h1>
          {errorStatus !== 404 && errorStatus !== 403 && <Button variant="outline" onClick={() => void mutate()}>Try again</Button>}
        </div>
      </div>
    )
  }

  const enrollment = data.student.enrollments?.[0]
  const lessonAttendance = calculateAttendanceFromRecords(data.attendanceRecords.filter(record => !record.lesson.isExamDay))
  const rotationCounts = (serving.data?.assignments ?? []).reduce((counts, assignment) => ({
    present: counts.present + (assignment.attendance?.present ?? 0),
    total: counts.total + (assignment.attendance?.effectiveTotal ?? 0),
  }), { present: 0, total: 0 })
  const attendance = asyncStudent ? (rotationCounts.total ? rotationCounts.present / rotationCounts.total * 100 : null) : lessonAttendance
  const examAverage = data.examScores.length ? data.examScores.reduce((sum, score) => sum + score.percentage, 0) / data.examScores.length : null
  const stats = [
    { label: 'Program status', value: enrollment?.status.replaceAll('_', ' ') ?? 'Not enrolled', detail: enrollment ? enrollment.isAsyncStudent ? 'Async · no cohort year' : `${enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} · In person` : 'No enrollment on file' },
    { label: 'Attendance', value: asyncStudent && serving.error ? 'Unavailable' : asyncStudent && serving.isLoading ? 'Loading rotations...' : attendance === null ? 'No records' : `${attendance.toFixed(1)}%`, detail: asyncStudent ? '75% required · elapsed rotation weeks' : '75% required · exam days excluded' },
    { label: 'Exam average', value: examAverage === null ? 'No scores' : `${examAverage.toFixed(1)}%`, detail: `${data.examScores.length} recorded exams · 75% required` },
    { label: 'Mentor', value: enrollment?.mentor?.name ?? data.student.annualMentorRequirement?.information?.mentorName ?? 'Not assigned', detail: data.student.annualMentorRequirement?.information ? (data.student.annualMentorRequirement.information.reviewedAt ? 'Annual information reviewed' : 'Annual information awaiting review') : 'No annual information on file' },
  ]

  return (
    <div className="min-h-screen bg-canvas p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {back}
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Servants Prep · Student profile</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{data.student.name}</h1>
            {enrollment?.isAsyncStudent && <AsyncBadge />}
            {data.student.isDisabled && <Badge variant="outline">Account disabled</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">Program information and recorded history across all academic years.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(stat => <Card key={stat.label}><CardContent className="space-y-1 pt-5"><p className="text-sm text-muted-foreground">{stat.label}</p><p className="break-words text-xl font-semibold">{stat.value}</p><p className="text-xs text-muted-foreground">{stat.detail}</p></CardContent></Card>)}
        </div>
        <StudentDetailsModal
          key={id}
          presentation="page"
          readOnly={session?.user.role === 'PRIEST'}
          studentId={id}
          studentName={data.student.name}
          student={data.student}
          examScores={data.examScores}
          attendanceRecords={data.attendanceRecords}
          allExams={data.allExams}
          allLessons={data.allLessons}
          loading={false}
          onClose={() => {}}
          onRefresh={() => void mutate()}
        />
      </div>
    </div>
  )
}
