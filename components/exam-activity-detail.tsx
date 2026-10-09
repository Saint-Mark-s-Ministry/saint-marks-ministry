import type { ExamActivity } from '@/lib/digital-exam-types'
import { examActivityMessage } from '@/lib/exam-activity-messages'

export function ExamActivityDetail({ event }: { event: ExamActivity }) {
  return <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <span className="text-sm">{examActivityMessage(event.kind, event).title}</span>
    <time className="text-xs text-ink-3" dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time>
  </div>
}
