import { describe, expect, it } from 'vitest'
import {
  ageOnBirthdayInYear,
  compareBirthdays,
  formatBirthday,
  getBirthdayParts,
  isBirthdayToday,
} from '@/lib/sunday-school-birthdays'

describe('Sunday School birthdays', () => {
  it('reads stored calendar dates in UTC without shifting the day', () => {
    // Stored at midnight UTC. In a western zone this is still the 4th, and it must read as the 4th.
    expect(getBirthdayParts('2014-10-04T00:00:00.000Z')).toEqual({
      year: 2014,
      month: 10,
      day: 4,
    })
    expect(formatBirthday('2014-10-04T00:00:00.000Z')).toBe('October 4')
  })

  it('calculates the age reached during the selected calendar year, never negative', () => {
    expect(ageOnBirthdayInYear('2014-10-04T00:00:00.000Z', 2026)).toBe(12)
    expect(ageOnBirthdayInYear('2030-01-01T00:00:00.000Z', 2026)).toBe(0)
  })

  it('recognizes a Today birthday by UTC month and day', () => {
    const now = new Date('2026-10-06T12:00:00.000Z')
    expect(isBirthdayToday('2019-10-06T00:00:00.000Z', now)).toBe(true)
    expect(isBirthdayToday('2019-10-07T00:00:00.000Z', now)).toBe(false)
  })

  it('sorts by month, day, and then name', () => {
    const children = [
      { firstName: 'Zoe', lastName: 'B', birthDate: '2014-10-05T00:00:00.000Z' },
      { firstName: 'Adam', lastName: 'A', birthDate: '2014-02-10T00:00:00.000Z' },
      { firstName: 'Mina', lastName: 'C', birthDate: '2014-10-04T00:00:00.000Z' },
    ]

    expect(children.sort(compareBirthdays).map(child => child.firstName)).toEqual(['Adam', 'Mina', 'Zoe'])
  })

  it('returns null for an unreadable date', () => {
    expect(getBirthdayParts('not a date')).toBeNull()
  })
})
