import { StatusBadge } from '@/components/ds/status-badge'
import type { SundaySchoolWeeklyLessonStatus } from '@/types/sunday-school'

/** One wording for a week's lesson everywhere it appears. */
export function LessonStatusBadge({ status }: { status: SundaySchoolWeeklyLessonStatus | undefined }) {
  if (status === 'READY') return <StatusBadge tone="ok">Ready</StatusBadge>
  if (status === 'NEEDS_LINKS') return <StatusBadge tone="warn">Needs links</StatusBadge>
  if (status === 'UNASSIGNED') return <StatusBadge tone="neutral">No teacher</StatusBadge>
  return <StatusBadge tone="neutral">Not scheduled</StatusBadge>
}
