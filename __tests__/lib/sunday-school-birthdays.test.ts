import { describe, expect, it } from 'vitest'
import {
  ageOnBirthdayInYear,
  compareBirthdays,
  formatBirthday,
  getBirthdayParts,
} from '@/lib/sunday-school-birthdays'

describe('Sunday School birthdays', () => {
  it('reads stored calendar dates in UTC without shifting the day', () => {
    expect(getBirthdayParts('2014-10-04T00:00:00.000Z')).toEqual({
      year: 2014,
      month: 10,
      day: 4,
    })
    expect(formatBirthday('2014-10-04T00:00:00.000Z')).toBe('October 4')
  })

  it('calculates the age reached during the selected calendar year', () => {
    expect(ageOnBirthdayInYear('2014-10-04T00:00:00.000Z', 2026)).toBe(12)
  })

  it('sorts by month, day, and then name', () => {
    const children = [
      { firstName: 'Zoe', lastName: 'B', birthDate: '2014-10-05T00:00:00.000Z' },
      { firstName: 'Adam', lastName: 'A', birthDate: '2014-02-10T00:00:00.000Z' },
      { firstName: 'Mina', lastName: 'C', birthDate: '2014-10-04T00:00:00.000Z' },
    ]

    expect(children.sort(compareBirthdays).map(child => child.firstName)).toEqual(['Adam', 'Mina', 'Zoe'])
  })
})
