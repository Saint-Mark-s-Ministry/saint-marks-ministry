import type { ExamActivity } from '@/lib/digital-exam-types'
import { examActivityMessage } from '@/lib/exam-activity-messages'

export function ExamActivityDetail({ event }: { event: ExamActivity }) {
  const message = examActivityMessage(event.kind, event)
  return <div className="space-y-1">
    <p className="text-sm font-medium">{message.title}</p>
    <p className="text-xs text-ink-3">Received <time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>{event.clientAt && <> · Device time <time dateTime={event.clientAt}>{new Date(event.clientAt).toLocaleString()}</time></>}</p>
    <p className="text-sm text-ink-2">{message.detail}</p>
    <p className="text-sm text-ink-3">Next step: {message.nextStep}</p>
  </div>
}
