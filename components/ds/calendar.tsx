'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { BookOpen, ChevronLeft, ChevronRight, FileText, Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Calendar events: icon + tint, one per type (design system §04).
 * Only types with a real data source are listed; add one here when a
 * feature starts producing dated items of that kind.
 */
export type CalendarEventType = 'prep-lesson' | 'exam' | 'sunday-lesson'

export const EVENT_TYPES: Record<CalendarEventType, { label: string; icon: LucideIcon; tint: string; ink: string }> = {
  'prep-lesson': { label: 'Prep lesson', icon: BookOpen, tint: 'bg-accent-tint', ink: 'text-accent-ink' },
  exam: { label: 'Exam', icon: FileText, tint: 'bg-info-tint', ink: 'text-info' },
  'sunday-lesson': { label: 'Sunday lesson', icon: Presentation, tint: 'bg-gold-tint', ink: 'text-gold' },
}

export interface CalendarEvent {
  id: string
  /** Calendar day, YYYY-MM-DD (lesson and exam dates are stored at midnight UTC). */
  day: string
  type: CalendarEventType
  title: string
  meta?: string
  href?: string
  /** Muted when it didn't happen (cancelled, no class). */
  muted?: boolean
}

/** YYYY-MM-DD for a stored calendar date (midnight UTC). */
export const utcDayKey = (date: string | Date) => new Date(date).toISOString().slice(0, 10)

/** YYYY-MM-DD for the viewer's own today. */
export function localDayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Day keys from `from` for `count` days, in the viewer's calendar. */
export function nextDays(count: number, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i)
    return localDayKey(d)
  })
}

const keyToDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function EventChip({ event }: { event: CalendarEvent }) {
  const type = EVENT_TYPES[event.type]
  const Icon = type.icon
  const body = (
    <>
      <Icon className={cn('size-3 shrink-0', type.ink)} strokeWidth={2} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{event.title}</span>
    </>
  )
  const className = cn(
    'flex h-[22px] min-w-0 items-center gap-[5px] rounded-[4px] px-1.5 text-[11.5px] leading-none text-ink no-underline',
    type.tint,
    event.muted && 'line-through opacity-60'
  )
  const label = `${type.label}: ${event.title}${event.meta ? `, ${event.meta}` : ''}`
  return event.href ? (
    <Link href={event.href} className={cn(className, 'hover:brightness-95')} title={label}>
      {body}
    </Link>
  ) : (
    <span className={className} title={label}>
      {body}
    </span>
  )
}

export function EventLegend({ types }: { types: CalendarEventType[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-ink-3">
      {types.map((t) => {
        const Icon = EVENT_TYPES[t].icon
        return (
          <li key={t} className="inline-flex items-center gap-1.5">
            <span className={cn('flex size-4 items-center justify-center rounded-[4px]', EVENT_TYPES[t].tint)}>
              <Icon className={cn('size-2.5', EVENT_TYPES[t].ink)} strokeWidth={2.25} aria-hidden />
            </span>
            {EVENT_TYPES[t].label}
          </li>
        )
      })}
    </ul>
  )
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Month grid, Sunday first. `month` is any day in the month to show. */
export function MonthCalendar({
  month,
  events,
  onMonthChange,
  maxPerDay = 3,
}: {
  month: Date
  events: CalendarEvent[]
  onMonthChange: (next: Date) => void
  maxPerDay?: number
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  const today = localDayKey()
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e])

  const title = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (n: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <h3 className="text-[15px] font-semibold text-ink" aria-live="polite">
          {title}
        </h3>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={() => onMonthChange(new Date())}>
            Today
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div role="grid" aria-label={title} className="grid grid-cols-7 border-t border-line">
        <div role="row" className="contents">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              role="columnheader"
              className="border-b border-line bg-raised px-2 py-1.5 text-xs font-medium text-ink-3 [&:not(:first-child)]:border-l"
            >
              {d}
            </div>
          ))}
        </div>
        {days.map((date, i) => {
          const key = localDayKey(date)
          const inMonth = date.getMonth() === month.getMonth()
          const dayEvents = byDay.get(key) ?? []
          const isToday = key === today
          const label =
            date.getDate() === 1 || i === 0
              ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : String(date.getDate())
          return (
            <div
              key={key}
              role="gridcell"
              aria-label={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayEvents.length ? `, ${dayEvents.length} events` : ''}`}
              className={cn(
                'flex h-[104px] min-w-0 flex-col gap-[3px] overflow-hidden p-1.5',
                i % 7 !== 0 && 'border-l border-line',
                i >= 7 && 'border-t border-line'
              )}
            >
              <div className="tabular flex h-[22px] items-center gap-1.5 pl-[3px] text-[12.5px]">
                {isToday ? (
                  <>
                    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-brand px-1 font-semibold text-white">
                      {date.getDate()}
                    </span>
                    <span className="text-[11px] font-semibold text-accent-ink">Today</span>
                  </>
                ) : (
                  <span className={cn('font-medium', inMonth ? 'text-ink' : 'text-ink-3')}>{label}</span>
                )}
              </div>
              {dayEvents.slice(0, maxPerDay).map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
              {dayEvents.length > maxPerDay && (
                <span className="pl-1.5 text-[11px] text-ink-3">+{dayEvents.length - maxPerDay} more</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Agenda: one row per day that has something, plus today (research finding 03). */
export function Agenda({
  days,
  events,
  renderAction,
  emptyToday = 'Nothing scheduled today',
}: {
  days: string[]
  events: CalendarEvent[]
  renderAction?: (event: CalendarEvent) => React.ReactNode
  emptyToday?: string
}) {
  const today = localDayKey()
  const rows = days
    .map((day) => ({ day, items: events.filter((e) => e.day === day) }))
    .filter((r) => r.items.length > 0 || r.day === today)

  if (rows.length === 0) {
    return <p className="px-4 py-6 text-[13px] text-ink-3">Nothing scheduled in the next {days.length} days.</p>
  }

  return (
    <ol className="divide-y divide-line">
      {rows.map(({ day, items }) => {
        const date = keyToDate(day)
        return (
          <li key={day} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 px-4 py-3">
            <div className="flex flex-col leading-tight">
              <span className="text-[11px] font-medium text-ink-3 uppercase">
                {date.toLocaleDateString('en-US', { weekday: 'short' })}
              </span>
              <span className={cn('tabular text-lg font-semibold', day === today ? 'text-accent-ink' : 'text-ink')}>
                {date.getDate()}
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-2.5">
              {items.length === 0 && <p className="pt-1 text-[13px] text-ink-3">{emptyToday}</p>}
              {items.map((e) => {
                const type = EVENT_TYPES[e.type]
                const Icon = type.icon
                return (
                  <div key={e.id} className="flex min-w-0 items-start gap-2.5">
                    <span className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md', type.tint)}>
                      <Icon className={cn('size-3.5', type.ink)} strokeWidth={2} aria-hidden />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      {e.href ? (
                        <Link href={e.href} className={cn('truncate text-[13.5px] font-medium text-ink no-underline hover:underline', e.muted && 'line-through opacity-60')}>
                          {e.title}
                        </Link>
                      ) : (
                        <span className={cn('truncate text-[13.5px] font-medium text-ink', e.muted && 'line-through opacity-60')}>{e.title}</span>
                      )}
                      {e.meta && <span className="truncate text-xs text-ink-3">{e.meta}</span>}
                      {renderAction && <div className="mt-2 empty:hidden">{renderAction(e)}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
