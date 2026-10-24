import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyReadings, ReadingSection } from '@/lib/liturgical'
import { getReadingCycle } from '@/lib/liturgical-cycle'

const mocks = vi.hoisted(() => ({
  readings: {} as Record<string, DailyReadings>,
  searchParams: new URLSearchParams('date=2026-10-18'),
}))

vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ status: 'authenticated', session: { user: { role: 'STUDENT' } } }) }))
vi.mock('next/navigation', () => ({ useSearchParams: () => mocks.searchParams }))
vi.mock('@/components/liturgical/use-church-today', () => ({ useChurchToday: () => '2026-10-19' }))
vi.mock('@/components/liturgical/calendar-subscribe-button', () => ({ CalendarSubscribeButton: () => null }))
vi.mock('@/lib/swr', () => ({
  useDailyReadings: (date: string) => ({ data: mocks.readings[date], error: undefined, isLoading: false }),
  useLiturgicalDay: () => ({ data: undefined }),
}))

import DailyReadingsPage from '@/app/dashboard/readings/page'

const gospel = (reference: string, text: string): ReadingSection => ({
  key: 'LGospel',
  label: 'Liturgy Gospel',
  service: 'liturgy',
  passages: [{ bookName: 'Matthew', reference, chapters: [{ chapter: 12, verses: [{ num: 9, text }] }] }],
})

function dayOf(date: string, section: ReadingSection, season = 'Annual Days'): DailyReadings {
  const readingCycle = getReadingCycle(date)
  return {
    date,
    language: 'en',
    copticDate: null,
    season,
    seasonDay: readingCycle.kind === 'annual' ? null : readingCycle.label,
    readingCycle,
    sections: readingCycle.available ? [section] : [],
    annualSections: readingCycle.available ? [] : [section],
    synaxarium: [{ name: 'St. Pelagia', text: null }],
  }
}

describe('Daily readings page', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('date=2026-10-18')
    mocks.readings = {
      '2026-10-18': dayOf('2026-10-18', gospel('Matthew 12:9-23', 'Annual verse for 8 Baba')),
      '2026-10-19': dayOf('2026-10-19', gospel('John 10:1-16', 'Weekday verse')),
      '2026-10-17': dayOf('2026-10-17', gospel('Luke 1:1-4', 'Saturday verse')),
      '2027-05-02': dayOf('2027-05-02', gospel('Luke 10:21-24', 'Annual verse for 24 Baramouda'), 'Holy 50s'),
    }
  })

  it('does not present the annual 8 Baba readings as the readings for the 2nd Sunday of Baba', async () => {
    const user = userEvent.setup()
    render(<DailyReadingsPage />)

    expect(await screen.findByRole('heading', { name: 'Readings for 2nd Sunday of Baba aren’t available yet' })).toBeInTheDocument()
    expect(screen.getByText(/doesn’t include the Sunday Katameros yet/)).toBeInTheDocument()
    expect(screen.queryByText('Annual verse for 8 Baba')).not.toBeInTheDocument()
    // The Synaxarium follows the Coptic date, so it is still right and still shown.
    expect(screen.getByText('St. Pelagia')).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Show the annual readings for 8 Baba' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(screen.getByText('Annual verse for 8 Baba')).toBeInTheDocument()
    expect(screen.getByText('Divine Liturgy · annual readings for 8 Baba')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide the annual readings for 8 Baba' })).toHaveAttribute('aria-expanded', 'true')

    // Moving to another day and back hides them again rather than carrying the choice over.
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    expect(screen.getByText('Weekday verse')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(screen.queryByText('Annual verse for 8 Baba')).not.toBeInTheDocument()
  })

  it('shows a weekday’s readings directly under the service heading', async () => {
    mocks.searchParams = new URLSearchParams('date=2026-10-19')
    render(<DailyReadingsPage />)
    expect(await screen.findByText('Weekday verse')).toBeInTheDocument()
    expect(screen.getByText('Divine Liturgy')).toBeInTheDocument()
    expect(screen.queryByText(/aren’t available yet/)).not.toBeInTheDocument()
  })

  it('names the missing book in the Holy 50s and labels the day and season', async () => {
    mocks.searchParams = new URLSearchParams('date=2027-05-02')
    render(<DailyReadingsPage />)
    expect(await screen.findByRole('heading', { name: 'Readings for Feast of the Resurrection aren’t available yet' })).toBeInTheDocument()
    expect(screen.getByText(/doesn’t include the Katameros of the Holy 50s yet/)).toBeInTheDocument()
    expect(screen.getByText('Holy 50s')).toBeInTheDocument()
    expect(screen.queryByText('Annual verse for 24 Baramouda')).not.toBeInTheDocument()
  })
})
