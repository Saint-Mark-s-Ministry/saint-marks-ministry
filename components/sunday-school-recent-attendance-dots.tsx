import type { AttendanceStatus } from '@prisma/client'
import { cn } from '@/lib/utils'

const DOT: Record<AttendanceStatus, { className: string; label: string }> = {
  PRESENT: { className: 'bg-ok', label: 'present' },
  LATE: { className: 'bg-warn', label: 'late' },
  ABSENT: { className: 'bg-bad', label: 'absent' },
  EXCUSED: { className: 'bg-info', label: 'excused' },
}

/**
 * The child's last few meetings, oldest first, as small dots next to their
 * name: enough to notice "missed the last three" without opening History.
 */
export function RecentAttendanceDots({ statuses }: { statuses: Array<AttendanceStatus | null> }) {
  if (statuses.length === 0) return null
  const counts = new Map<string, number>()
  for (const status of statuses) {
    const label = status ? DOT[status].label : 'not recorded'
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  const summary = [...counts.entries()].map(([label, count]) => `${count} ${label}`).join(', ')
  return (
    <span role="img" aria-label={`Last ${statuses.length} meetings: ${summary}`} title={`Last ${statuses.length} meetings: ${summary}`} className="flex items-center gap-[3px]">
      {statuses.map((status, index) => (
        <span
          key={index}
          className={cn('size-[7px] rounded-full', status ? DOT[status].className : 'border border-line-strong')}
        />
      ))}
    </span>
  )
}
