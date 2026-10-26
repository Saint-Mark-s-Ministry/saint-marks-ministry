import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LiturgicalDay } from '@/lib/liturgical'

const useLiturgicalDay = vi.hoisted(() => vi.fn())
vi.mock('@/lib/swr', () => ({ useLiturgicalDay }))

import { TodayInChurch } from '@/components/liturgical/today-in-church'

const day: LiturgicalDay = {
  date: '2027-01-07',
  language: 'en',
  copticDate: { day: 29, month: 4, year: 1743, monthName: 'Koiak', label: '29 Koiak 1743 A.M.' },
  season: { key: 'nativity', name: 'Nativity Feast', startDate: '2027-01-07', endDate: '2027-01-17' },
  seasonDay: null,
  fasting: { fast: null },
  feasts: [
    { name: 'Nativity', category: 'majorFeast' },
    { name: 'Monthly commemoration', category: 'commemoration' },
  ],
  saints: ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name: `St. ${name}` })),
  readingCycle: { kind: 'annual', label: '29 Koiak', annualDay: '29 Koiak', available: true },
  readings: [{ key: 'LGospel', label: 'Liturgy Gospel', service: 'liturgy', reference: 'Matthew 1:18-25' }],
  available: true,
}

describe('TodayInChurch', () => {
  beforeEach(() => useLiturgicalDay.mockReset())

  it('shows the Coptic date, feasts, Gospel and saints', () => {
    useLiturgicalDay.mockReturnValue({ data: day, isLoading: false })
    render(<TodayInChurch />)

    expect(screen.getByText('29 Koiak 1743 A.M.')).toBeInTheDocument()
    expect(screen.getByText('Nativity')).toBeInTheDocument()
    expect(screen.queryByText('Monthly commemoration')).not.toBeInTheDocument()
    expect(screen.getByText('No fast today')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Matthew 1:18-25' })).toHaveAttribute('href', '/dashboard/readings')
    expect(screen.getByText(/St\. A · St\. B · St\. C · and 2 more/)).toBeInTheDocument()
  })

  it('says the Sunday readings are not available instead of showing another day’s Gospel', () => {
    useLiturgicalDay.mockReturnValue({
      data: {
        ...day,
        date: '2026-10-18',
        season: { key: 'annual', name: 'Annual Days', startDate: null, endDate: null },
        seasonDay: '2nd Sunday of Baba',
        readingCycle: { kind: 'sunday', label: '2nd Sunday of Baba', annualDay: '8 Baba', available: false },
        readings: [],
      },
      isLoading: false,
    })
    render(<TodayInChurch />)

    expect(screen.getByText('Annual Days')).toBeInTheDocument()
    expect(screen.getByText('2nd Sunday of Baba')).toBeInTheDocument()
    expect(screen.getByText('Today’s readings aren’t available yet.')).toBeInTheDocument()
    expect(screen.queryByText(/Liturgy Gospel/)).not.toBeInTheDocument()
  })

  it('still renders a response cached before reading cycles and computed seasons existed', () => {
    const { readingCycle: _readingCycle, ...legacy } = day
    useLiturgicalDay.mockReturnValue({ data: { ...legacy, season: null }, isLoading: false })
    render(<TodayInChurch />)
    expect(screen.getByRole('link', { name: 'Matthew 1:18-25' })).toBeInTheDocument()
  })

  it('falls back quietly when Coptic IO is unavailable', () => {
    useLiturgicalDay.mockReturnValue({ data: { ...day, available: false }, isLoading: false })
    render(<TodayInChurch />)
    expect(screen.getByText('The church calendar is unavailable right now.')).toBeInTheDocument()

    useLiturgicalDay.mockReturnValue({ data: undefined, error: new Error('503'), isLoading: false })
    render(<TodayInChurch />)
    expect(screen.getAllByText('The church calendar is unavailable right now.')).toHaveLength(2)
  })
})
