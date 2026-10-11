import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MonthCalendar, monthGridDays } from '@/components/ds/calendar'
import { toLiturgicalOverlay } from '@/components/liturgical/calendar-events'
import { calendarSubscriptionLinks, COPTIC_CALENDAR_FEED_URL } from '@/lib/liturgical'

describe('liturgical calendar overlay', () => {
  it('makes a chip per notable feast and a marker per fast day', () => {
    const overlay = toLiturgicalOverlay({
      '2027-01-07': {
        date: '2027-01-07',
        copticDate: { day: 29, month: 4, year: 1743, monthName: 'Koiak', label: '29 Koiak 1743 A.M.' },
        fast: null,
        feasts: [
          { name: 'Nativity', category: 'majorFeast' },
          { name: 'Monthly commemoration', category: 'commemoration' },
        ],
      },
      '2027-01-06': { date: '2027-01-06', copticDate: null, fast: { name: 'Paramoun', type: 'fast' }, feasts: [] },
    })

    expect(overlay.events).toEqual([
      expect.objectContaining({
        day: '2027-01-07',
        type: 'feast',
        title: 'Nativity',
        meta: 'Major feast · 29 Koiak 1743 A.M.',
        href: '/dashboard/readings?date=2027-01-07',
      }),
    ])
    expect(overlay.fastDays).toEqual({ '2027-01-06': 'Paramoun' })
    expect(toLiturgicalOverlay(undefined)).toEqual({ events: [], fastDays: {} })
  })

  it('lists every day the month grid shows, Sunday first', () => {
    const days = monthGridDays(new Date(2026, 9, 15))
    expect(days[0]).toBe('2026-09-27')
    expect(days).toContain('2026-10-31')
    expect(days.length % 7).toBe(0)
  })

  it('marks fast days on the month grid and announces them', () => {
    render(
      <MonthCalendar
        month={new Date(2026, 9, 15)}
        events={[{ id: 'f', day: '2026-10-14', type: 'feast', title: 'Feast of St. Mark' }]}
        fastDays={{ '2026-10-16': 'Friday Fast' }}
        onMonthChange={vi.fn()}
      />
    )
    expect(screen.getByTitle('Friday Fast')).toHaveTextContent('Fast')
    expect(screen.getByRole('gridcell', { name: /October 16, Friday Fast/ })).toBeInTheDocument()
    expect(screen.getByTitle('Feast: Feast of St. Mark')).toBeInTheDocument()
  })
})

describe('calendar subscription links', () => {
  it('offers webcal, Google and Outlook links to the Coptic IO feed', () => {
    const links = calendarSubscriptionLinks()
    expect(links.https).toBe(COPTIC_CALENDAR_FEED_URL)
    expect(links.webcal).toBe('webcal://api.coptic.io/api/calendar/ical/subscribe')
    expect(links.google).toBe(
      'https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fapi.coptic.io%2Fapi%2Fcalendar%2Fical%2Fsubscribe'
    )
    expect(new URL(links.outlookWeb).searchParams.get('url')).toBe(COPTIC_CALENDAR_FEED_URL)
  })
})
