import { cn } from '@/lib/utils'

export interface Kpi {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'bad' | 'warn' | 'ok'
}

const TONE = { bad: 'text-bad', warn: 'text-warn', ok: 'text-ok' }

/** One strip of numbers instead of repeated stat cards (research finding 02). */
export function KpiStrip({ items, className }: { items: Kpi[]; className?: string }) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-line bg-surface', className)}>
      {/* 1px gaps over a line-colored ground draw the dividers at any column count. */}
      <dl
        className={cn(
          'grid grid-cols-2 gap-px bg-line',
          items.length >= 6 ? 'md:grid-cols-3 lg:grid-cols-6' : items.length === 5 ? 'md:grid-cols-5' : items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'
        )}
      >
        {items.map((kpi) => (
          <div
            key={kpi.label}
            className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-3.5 last:odd:col-span-2 md:px-5 md:py-4 md:last:odd:col-span-1"
          >
            <dt className="text-xs font-medium text-ink-3">{kpi.label}</dt>
            <dd className={cn('tabular text-[28px] leading-none font-semibold tracking-[-0.02em]', kpi.tone ? TONE[kpi.tone] : 'text-ink')}>
              {kpi.value}
            </dd>
            {kpi.hint && <dd className="truncate text-xs text-ink-3">{kpi.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}
