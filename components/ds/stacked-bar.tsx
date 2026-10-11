import { cn } from '@/lib/utils'

/**
 * Readiness row: on-track vs. below-target as one horizontal bar.
 * Length reads at a glance; donuts and gauges don't (research finding 02).
 */
export function StackedBarRow({
  label,
  good,
  bad,
  goodLabel = 'on track',
  badLabel = 'below',
}: {
  label: React.ReactNode
  good: number
  bad: number
  goodLabel?: string
  badLabel?: string
}) {
  const total = good + bad
  const pct = total > 0 ? (good / total) * 100 : 0
  return (
    <div className="grid grid-cols-1 items-center gap-2 px-4 py-3 md:grid-cols-[140px_minmax(0,1fr)_auto] md:gap-4">
      <span className="text-[13px] text-ink-2">{label}</span>
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-[3px]">
        {total === 0 ? (
          <span className="flex-1 rounded-[3px] bg-track" />
        ) : (
          <>
            {good > 0 && <span className="rounded-[3px] bg-ok" style={{ width: `${pct}%` }} />}
            {bad > 0 && <span className="flex-1 rounded-[3px] bg-bad opacity-85" />}
          </>
        )}
      </div>
      <div className="tabular flex gap-3.5 text-[13px] md:justify-end">
        <span>
          <b className="font-semibold text-ok">{good}</b> <span className="text-ink-3">{goodLabel}</span>
        </span>
        <span>
          <b className={cn('font-semibold', bad > 0 ? 'text-bad' : 'text-ink-3')}>{bad}</b>{' '}
          <span className="text-ink-3">{badLabel}</span>
        </span>
      </div>
    </div>
  )
}

export function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-3">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('size-2 rounded-[2px]', item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  )
}
