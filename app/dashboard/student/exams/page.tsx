'use client'
import Link from 'next/link'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { useDigitalExams } from '@/lib/swr'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { formatDateUTC } from '@/lib/utils'

export default function StudentExamsPage() {
  const { session, status } = useAdminGuard(isStudent)
  const { data, error, isLoading } = useDigitalExams(status === 'authenticated' && !!session && isStudent(session.user.role))
  if (status !== 'authenticated' || !session || !isStudent(session.user.role)) return null
  return <div className="flex flex-col gap-5">
    <PageHeader title="Live Exam" meta={['Servants Prep', 'Original exams · Printed questions']} />
    <Panel title="Your exams" description="Makeup exams are completed on paper.">
      {error && <p role="alert" className="p-4 text-bad">Could not load exams. Please refresh.</p>}
      {isLoading && <p className="p-4 text-ink-3">Loading exams…</p>}
      {data?.exams.length === 0 && <p className="p-4 text-ink-3">Your proctor has not opened a live exam yet.</p>}
      <ul className="divide-y divide-line">{data?.exams.map(exam => {
        const submitted = exam.digitalSheet?.attempts[0]?.state === 'SUBMITTED'
        return <li key={exam.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-medium">{exam.examSection.displayName}</p><p className="text-sm text-ink-3">{formatDateUTC(exam.examDate)} · {exam.academicYear.name} · {submitted ? 'Submitted' : exam.digitalSheet?.state === 'OPEN' ? 'Open' : 'Closed'}</p></div>
          {submitted || exam.digitalSheet?.state === 'OPEN' ? <Button variant="outline" asChild><Link href={`/dashboard/student/exams/${exam.id}`}>{submitted ? 'Submission status' : 'Open live exam'}</Link></Button> : <span className="text-sm text-ink-3">Exam closed</span>}
        </li>
      })}</ul>
    </Panel>
  </div>
}
