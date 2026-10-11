import { cn } from '@/lib/utils'

/** ok at or above target, warn below it, bad below `floor`. */
export function metricTone(value: number, target = 75, floor = 50): 'ok' | 'warn' | 'bad' {
  if (value >= target) return 'ok'
  if (value >= floor) return 'warn'
  return 'bad'
}

const BAR = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }
const TEXT = { ok: 'text-ink', warn: 'text-warn', bad: 'text-bad' }

/**
 * Bar + value; the number takes color only below target (design system §04).
 * `value` is a percentage; null renders a dash.
 */
export function Metric({
  value,
  detail,
  target = 75,
  floor = 50,
  width = 56,
  className,
}: {
  value: number | null | undefined
  detail?: React.ReactNode
  target?: number
  floor?: number
  width?: number
  className?: string
}) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return <span className={cn('text-ink-3', className)}>—</span>
  }
  const tone = metricTone(value, target, floor)
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className="inline-block h-1.5 shrink-0 overflow-hidden rounded-[3px] bg-track"
        style={{ width }}
      >
        <span className={cn('block h-full rounded-[3px]', BAR[tone])} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      <span className={cn('tabular min-w-12 font-medium', TEXT[tone])}>{value.toFixed(1)}%</span>
      {detail && <span className="text-xs whitespace-nowrap text-ink-3">{detail}</span>}
    </span>
  )
}
