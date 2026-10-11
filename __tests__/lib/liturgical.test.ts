import { describe, expect, it } from 'vitest'
import {
  addDaysToDateKey,
  formatPassageReference,
  headlineReading,
  isLiturgicalDateKey,
  notableFeasts,
  parseFeastCategory,
  parseLiturgicalLanguage,
  secondsUntilChurchMidnight,
  sortFeasts,
  type ReadingReference,
} from '@/lib/liturgical'

describe('liturgical dates', () => {
  it('accepts only real days in the supported years', () => {
    expect(isLiturgicalDateKey('2026-10-11')).toBe(true)
    expect(isLiturgicalDateKey('2028-02-29')).toBe(true)
    expect(isLiturgicalDateKey('2026-02-29')).toBe(false)
    expect(isLiturgicalDateKey('2026-13-01')).toBe(false)
    expect(isLiturgicalDateKey('2026-1-1')).toBe(false)
    expect(isLiturgicalDateKey('1899-12-31')).toBe(false)
    expect(isLiturgicalDateKey('2200-01-01')).toBe(false)
    expect(isLiturgicalDateKey('2026-10-11/../../x')).toBe(false)
    expect(isLiturgicalDateKey(undefined)).toBe(false)
  })

  it('shifts date keys across month and year ends without timezone drift', () => {
    expect(addDaysToDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysToDateKey('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts down to midnight at the church, not on the server', () => {
    // 23:30 in New York (EDT, UTC-4) is 03:30 UTC the next day.
    expect(secondsUntilChurchMidnight(new Date('2026-10-12T03:30:00Z'))).toBe(30 * 60)
    expect(secondsUntilChurchMidnight(new Date('2026-10-11T04:00:00Z'))).toBe(86400)
    expect(secondsUntilChurchMidnight(new Date('2026-10-12T03:59:30Z'))).toBe(60)
  })

  it('defaults every unknown language to English', () => {
    expect(parseLiturgicalLanguage('ar')).toBe('ar')
    expect(parseLiturgicalLanguage('es')).toBe('en')
    expect(parseLiturgicalLanguage(null)).toBe('en')
  })
})

describe('feasts', () => {
  it('prefers category and falls back to the deprecated type', () => {
    expect(parseFeastCategory('minorFeast', 'feast')).toBe('minorFeast')
    expect(parseFeastCategory(undefined, 'lordlyFeast')).toBe('majorFeast')
    expect(parseFeastCategory('nonsense', undefined)).toBe('otherFeast')
  })

  it('ranks feasts of the Lord first and drops duplicates', () => {
    const sorted = sortFeasts([
      { name: 'Monthly commemoration of the Virgin', category: 'commemoration' },
      { name: 'Feast of St. Mark', category: 'otherFeast' },
      { name: 'Nativity', category: 'majorFeast' },
      { name: 'nativity ', category: 'majorFeast' },
    ])
    expect(sorted.map((feast) => feast.name)).toEqual(['Nativity', 'Feast of St. Mark', 'Monthly commemoration of the Virgin'])
    expect(notableFeasts(sorted).map((feast) => feast.name)).toEqual(['Nativity', 'Feast of St. Mark'])
  })
})

describe('readings', () => {
  const ref = (key: ReadingReference['key'], reference: string): ReadingReference => ({
    key,
    reference,
    label: key,
    service: 'liturgy',
  })

  it('headlines the Liturgy Gospel, then the nearest substitute', () => {
    expect(headlineReading([ref('Pauline', 'Romans 1:1-5'), ref('LGospel', 'Luke 4:1-13')])?.reference).toBe('Luke 4:1-13')
    expect(headlineReading([ref('MPsalm', 'Psalms 1:1'), ref('MGospel', 'John 1:1-5')])?.reference).toBe('John 1:1-5')
    expect(headlineReading([])).toBeNull()
  })

  it('builds a reference from the returned chapters', () => {
    const verses = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ num: from + i, text: '' }))
    expect(formatPassageReference('Luke', [{ chapter: 4, verses: verses(1, 13) }])).toBe('Luke 4:1-13')
    expect(formatPassageReference('Psalms', [{ chapter: 96, verses: verses(1, 2) }, { chapter: 97, verses: verses(3, 3) }])).toBe(
      'Psalms 96:1-2; 97:3'
    )
    expect(formatPassageReference('Jude', [{ chapter: 1, verses: [] }])).toBe('Jude 1')
  })
})
