'use client'

import { PageLoading } from '@/components/ui/page-loading'
import { use } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'
import { DigitalExamMonitor } from '@/components/digital-exam-monitor'
export default function ExamMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, status } = useAdminGuard(isAdmin)
  if (status !== 'authenticated' || !session || !isAdmin(session.user.role)) return <PageLoading />
  return <DigitalExamMonitor examId={id} />
}
