'use client'

import { PageLoading } from '@/components/ui/page-loading'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isStudent } from '@/lib/roles'
import { PageHeader } from '@/components/ds/page-header'
import { StudentConfessionSlips } from '@/components/student-confession-slips'

export default function StudentConfessionPage() {
  const { session, status } = useAdminGuard(isStudent)
  if (status !== 'authenticated' || !session || !isStudent(session.user.role)) return <PageLoading />
  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Confession" meta={['Servants Prep', 'Signed slip every two months']} />
      <StudentConfessionSlips />
    </div>
  )
}
