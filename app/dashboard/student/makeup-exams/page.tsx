'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { MakeupExamBookings } from '@/components/makeup-exam-bookings'
import { PageHeader } from '@/components/ds/page-header'

export default function MakeupExamsPage() {
  const { session, status } = useAdminGuard(isStudent)
  if (status !== 'authenticated' || !session || !isStudent(session.user.role)) return null
  return <div className="flex min-w-0 flex-col gap-5">
    <PageHeader title="Makeup exams" meta={['Servants Prep', 'Retake a failed or missed exam']} />
    <MakeupExamBookings />
  </div>
}
