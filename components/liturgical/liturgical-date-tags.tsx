import { StatusBadge } from '@/components/ds/status-badge'
import { cn } from '@/lib/utils'
import { isLordlyFeast, notableFeasts, type LiturgicalCalendarDay } from '@/lib/liturgical'

/**
 * What the Church keeps on a scheduled date — the feasts and the fast — shown
 * beside a lesson so whoever plans it can tie it to the day. Renders nothing
 * when the day is ordinary or Coptic IO had no answer.
 */
export function LiturgicalDateTags({
  day,
  showCopticDate = false,
  className,
}: {
  day: LiturgicalCalendarDay | undefined
  showCopticDate?: boolean
  className?: string
}) {
  if (!day) return null
  const feasts = notableFeasts(day.feasts)
  if (feasts.length === 0 && !day.fast && !(showCopticDate && day.copticDate)) return null

  return (
    <span className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}>
      {showCopticDate && day.copticDate && (
        <span className="text-xs text-ink-3">{day.copticDate.label}</span>
      )}
      {feasts.map((feast) => (
        <StatusBadge key={feast.name} tone={isLordlyFeast(feast) ? 'gold' : 'accent'} className="max-w-full">
          <span className="truncate">{feast.name}</span>
        </StatusBadge>
      ))}
      {day.fast && (
        <StatusBadge tone="neutral" className="max-w-full">
          <span className="truncate">{day.fast.name}</span>
        </StatusBadge>
      )}
    </span>
  )
}
