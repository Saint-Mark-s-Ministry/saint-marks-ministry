'use client'

import { cn } from '@/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: React.ReactNode
  count?: number
}

/** Segmented filter with counts inline (design system §04). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-[8px] bg-hover p-[3px] md:h-8', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
              active
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(27,24,23,0.08),0_0_0_1px_var(--ds-border-strong)]'
                : 'text-ink-2 hover:text-ink'
            )}
          >
            {option.label}
            {option.count !== undefined && <span className="tabular font-normal text-ink-3">{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
