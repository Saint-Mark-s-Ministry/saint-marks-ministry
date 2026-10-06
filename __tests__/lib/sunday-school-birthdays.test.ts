import { describe, expect, it } from 'vitest'
import { ageOnBirthdayInYear, getBirthdayParts, isBirthdayToday } from '@/lib/sunday-school-birthdays'

describe('birthday calendar values', () => {
  it('reads the UTC calendar day, so the day never shifts by device time zone', () => {
    // Stored at midnight UTC. In a western zone this is still the 3rd, and it must read as the 3rd.
    expect(getBirthdayParts('2019-02-03T00:00:00.000Z')).toEqual({ year: 2019, month: 2, day: 3 })
  })

  it('computes the age the child turns in the given year, never negative', () => {
    expect(ageOnBirthdayInYear('2019-02-03T00:00:00.000Z', 2026)).toBe(7)
    expect(ageOnBirthdayInYear('2030-01-01T00:00:00.000Z', 2026)).toBe(0)
  })

  it('recognizes a Today birthday by UTC month and day', () => {
    const now = new Date('2026-10-06T12:00:00.000Z')
    expect(isBirthdayToday('2019-10-06T00:00:00.000Z', now)).toBe(true)
    expect(isBirthdayToday('2019-10-07T00:00:00.000Z', now)).toBe(false)
  })

  it('returns null for an unreadable date', () => {
    expect(getBirthdayParts('not a date')).toBeNull()
  })
})
