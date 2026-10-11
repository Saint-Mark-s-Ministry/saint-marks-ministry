'use client'

import { useMemo } from 'react'
import type { CalendarEvent } from '@/components/ds/calendar'
import { useLiturgicalCalendar } from '@/lib/swr'
import { FEAST_CATEGORY_LABELS, notableFeasts, type LiturgicalCalendarDay } from '@/lib/liturgical'

export interface LiturgicalCalendarOverlay {
  /** One chip per feast, linking to that day's readings. */
  events: CalendarEvent[]
  /** Day key → the fast kept that day. */
  fastDays: Record<string, string>
}

/** Turn church-calendar days into calendar chips (feasts) and fast-day markers. */
export function toLiturgicalOverlay(days: Record<string, LiturgicalCalendarDay> | undefined): LiturgicalCalendarOverlay {
  const events: CalendarEvent[] = []
  const fastDays: Record<string, string> = {}
  for (const day of Object.values(days ?? {})) {
    for (const feast of notableFeasts(day.feasts)) {
      events.push({
        id: `feast-${day.date}-${feast.name}`,
        day: day.date,
        type: 'feast',
        title: feast.name,
        meta: [FEAST_CATEGORY_LABELS[feast.category], day.copticDate?.label].filter(Boolean).join(' · '),
        href: `/dashboard/readings?date=${day.date}`,
      })
    }
    if (day.fast) fastDays[day.date] = day.fast.name
  }
  events.sort((a, b) => a.day.localeCompare(b.day))
  return { events, fastDays }
}

/**
 * Feasts and fasts for the given days, ready to lay over a MonthCalendar or
 * Agenda. Empty while loading or if Coptic IO is unavailable, so the calendar
 * it decorates never waits on it.
 */
export function useLiturgicalCalendarOverlay(dayKeys: string[]): LiturgicalCalendarOverlay {
  const { data } = useLiturgicalCalendar(dayKeys)
  return useMemo(() => toLiturgicalOverlay(data), [data])
}
