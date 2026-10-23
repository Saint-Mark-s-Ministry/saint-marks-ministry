'use client'

import { FeedbackBoard } from '@/components/feedback-board'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'

export default function SundaySchoolFeedbackPage() {
  const { status } = useSundaySchoolGuard()
  return <FeedbackBoard sessionStatus={status} pageTitle="Ideas & feedback" />
}
