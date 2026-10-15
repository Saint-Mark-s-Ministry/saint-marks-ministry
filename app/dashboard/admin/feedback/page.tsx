'use client'

import { FeedbackBoard } from '@/components/feedback-board'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'

export default function PrepFeedbackPage() {
  const { status } = useAdminGuard(isAdmin)
  return <FeedbackBoard sessionStatus={status} />
}
