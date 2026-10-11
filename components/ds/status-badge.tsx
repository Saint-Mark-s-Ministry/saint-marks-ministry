import { cn } from '@/lib/utils'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'accent' | 'gold'

const TONES: Record<Tone, { ground: string; dot: string }> = {
  ok: { ground: 'bg-ok-tint text-ok', dot: 'bg-ok' },
  warn: { ground: 'bg-warn-tint text-warn', dot: 'bg-warn' },
  bad: { ground: 'bg-bad-tint text-bad', dot: 'bg-bad' },
  info: { ground: 'bg-info-tint text-info', dot: 'bg-info' },
  accent: { ground: 'bg-accent-tint text-accent-ink', dot: 'bg-accent-ink' },
  gold: { ground: 'bg-gold-tint text-gold', dot: 'bg-gold' },
  neutral: { ground: 'border border-line-strong bg-transparent text-ink-3', dot: 'bg-ink-3' },
}

/** Status is always a word plus a dot, never color alone (design system §04). */
export function StatusBadge({
  tone,
  children,
  dot = true,
  className,
}: {
  tone: Tone
  children: React.ReactNode
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap',
        TONES[tone].ground,
        className
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONES[tone].dot)} />}
      {children}
    </span>
  )
}

export const ATTENDANCE_TONE = {
  PRESENT: 'ok',
  LATE: 'warn',
  ABSENT: 'bad',
  EXCUSED: 'info',
} as const satisfies Record<string, Tone>
