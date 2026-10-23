import { describe, expect, it } from 'vitest'
import { getCheckInWeek } from '@/lib/sunday-school-check-ins'

describe('check-in calendar week', () => {
  it.each([
    ['2026-10-26T03:59:59Z', '2026-10-19', '2026-10-26', '2026-10-25'],
    ['2026-10-26T04:00:00Z', '2026-10-26', '2026-11-02', '2026-10-26'],
    ['2026-11-02T04:59:59Z', '2026-10-26', '2026-11-02', '2026-11-01'],
    ['2026-11-02T05:00:00Z', '2026-11-02', '2026-11-09', '2026-11-02'],
    ['2027-01-01T12:00:00Z', '2026-12-28', '2027-01-04', '2027-01-01'],
  ])('uses New York Monday boundaries at %s', (now, start, end, today) => {
    const week = getCheckInWeek(new Date(now))
    expect(week.start.toISOString()).toBe(`${start}T00:00:00.000Z`)
    expect(week.end.toISOString()).toBe(`${end}T00:00:00.000Z`)
    expect(week.today.toISOString()).toBe(`${today}T00:00:00.000Z`)
  })
})
