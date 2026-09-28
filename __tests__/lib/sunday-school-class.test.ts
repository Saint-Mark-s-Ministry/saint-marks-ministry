import { describe, it, expect } from 'vitest'
import { SundaySchoolLevel } from '@prisma/client'
import {
  compareAgeGroupsByLevel,
  compareClassNames,
  compareClassesByLevelAndName,
  LEVEL_ORDER,
  getClassMeetingDayName,
  getChildFullName,
  getLevelDisplayName,
  getMostRecentClassMeetingDate,
  getMostRecentSunday,
  getSundaySchoolTodayDateInputValue,
  getTodayDateInputValue,
  isValidLevel,
  isSessionDateToday,
  normalizeSessionDate,
  toDateInputValue,
} from '@/lib/sunday-school-class'

describe('Sunday School class helpers', () => {
  describe('LEVEL_ORDER', () => {
    it('runs Pre-K through one combined College & Grad level', () => {
      expect(LEVEL_ORDER).toHaveLength(16)
      expect(LEVEL_ORDER[0]).toBe('PRE_K')
      expect(LEVEL_ORDER[1]).toBe('KINDERGARTEN')
      expect(LEVEL_ORDER.slice(6, 9)).toEqual(['GRADE_5', 'SPECIAL_NEEDS', 'GRADE_6'])
      expect(LEVEL_ORDER.slice(-2)).toEqual(['GRADE_12', 'COLLEGE_GRAD'])
    })

    it('has a display name for every level', () => {
      for (const level of LEVEL_ORDER) {
        expect(getLevelDisplayName(level)).toBeTruthy()
      }
    })
  })

  describe('isValidLevel', () => {
    it('accepts real levels', () => {
      expect(isValidLevel('GRADE_7')).toBe(true)
      expect(isValidLevel('PRE_K')).toBe(true)
      expect(isValidLevel('SPECIAL_NEEDS')).toBe(true)
      expect(isValidLevel('COLLEGE_GRAD')).toBe(true)
    })

    it('rejects anything else', () => {
      // GRADE_6_PLUS belongs to the prep-side SundaySchoolGrade enum
      expect(isValidLevel('GRADE_6_PLUS')).toBe(false)
      expect(isValidLevel('GRADE_13')).toBe(false)
      expect(isValidLevel('COLLEGE')).toBe(false)
      expect(isValidLevel('GRAD')).toBe(false)
      expect(isValidLevel('')).toBe(false)
      expect(isValidLevel(null)).toBe(false)
      expect(isValidLevel(3)).toBe(false)
    })
  })

  describe('normalizeSessionDate', () => {
    it('leaves a plain YYYY-MM-DD at midnight UTC', () => {
      const date = normalizeSessionDate('2026-08-09')
      expect(date.toISOString()).toBe('2026-08-09T00:00:00.000Z')
    })

    it('truncates a full timestamp to its UTC day', () => {
      const date = normalizeSessionDate('2026-08-09T18:45:12.000Z')
      expect(date.toISOString()).toBe('2026-08-09T00:00:00.000Z')
    })

    it('makes the same calendar day collide, so a session is unique per date', () => {
      const morning = normalizeSessionDate('2026-08-09T09:00:00.000Z')
      const evening = normalizeSessionDate('2026-08-09T21:30:00.000Z')
      expect(morning.getTime()).toBe(evening.getTime())
    })

    it('rejects an unparseable date', () => {
      expect(() => normalizeSessionDate('not-a-date')).toThrow('Invalid session date')
    })
  })

  describe('session-day attendance window', () => {
    it('uses the church calendar date across UTC boundaries', () => {
      const lateSundayInNewYork = new Date('2026-08-10T03:30:00.000Z')
      expect(getSundaySchoolTodayDateInputValue(lateSundayInNewYork)).toBe('2026-08-09')
      expect(isSessionDateToday('2026-08-09', lateSundayInNewYork)).toBe(true)
      expect(isSessionDateToday('2026-08-08', lateSundayInNewYork)).toBe(false)
    })
  })

  describe('getMostRecentSunday', () => {
    it('returns the same day when given a Sunday', () => {
      // 2026-08-09 is a Sunday
      const sunday = getMostRecentSunday(new Date(2026, 7, 9, 14, 30))
      expect(toDateInputValue(sunday)).toBe('2026-08-09')
    })

    it('walks back to the previous Sunday mid-week', () => {
      // 2026-08-12 is a Wednesday
      const sunday = getMostRecentSunday(new Date(2026, 7, 12, 8, 0))
      expect(toDateInputValue(sunday)).toBe('2026-08-09')
    })

    it('crosses a month boundary', () => {
      // 2026-08-01 is a Saturday; the Sunday before is 2026-07-26
      const sunday = getMostRecentSunday(new Date(2026, 7, 1, 23, 59))
      expect(toDateInputValue(sunday)).toBe('2026-07-26')
    })

    it('lands at midnight UTC so it matches stored session dates', () => {
      const sunday = getMostRecentSunday(new Date(2026, 7, 12))
      expect(sunday.toISOString()).toBe('2026-08-09T00:00:00.000Z')
    })
  })

  describe('class meeting day', () => {
    it('uses Saturday for Elementary and Sunday for older classes', () => {
      expect(getClassMeetingDayName(SundaySchoolLevel.GRADE_5)).toBe('Saturday')
      expect(getClassMeetingDayName(SundaySchoolLevel.SPECIAL_NEEDS)).toBe('Saturday')
      expect(getClassMeetingDayName(SundaySchoolLevel.GRADE_6)).toBe('Sunday')
    })

    it('finds the correct most recent meeting date for each class', () => {
      const monday = new Date(2026, 8, 21, 12)

      expect(toDateInputValue(getMostRecentClassMeetingDate(SundaySchoolLevel.GRADE_3, monday)))
        .toBe('2026-09-19')
      expect(toDateInputValue(getMostRecentClassMeetingDate(SundaySchoolLevel.GRADE_8, monday)))
        .toBe('2026-09-20')
    })
  })

  describe('getTodayDateInputValue', () => {
    it('formats the local calendar day, not the UTC one', () => {
      // Late evening local time — the UTC date may already be tomorrow, but
      // the date picker should still cap at the viewer's today
      const local = new Date(2026, 7, 12, 23, 30)
      expect(getTodayDateInputValue(local)).toBe('2026-08-12')
    })

    it('zero-pads single-digit months and days', () => {
      expect(getTodayDateInputValue(new Date(2026, 0, 5))).toBe('2026-01-05')
    })
  })

  describe('getChildFullName', () => {
    it('joins first and last name', () => {
      expect(getChildFullName({ firstName: 'Mina', lastName: 'Girgis' })).toBe('Mina Girgis')
    })
  })
})

describe('compareClassNames', () => {
  it('sorts class names alphabetically with numbers in human order', () => {
    const names = ['Grade 10 Boys', 'Grade 2 Boys', 'Alpha', 'grade 1 boys']

    expect(names.sort(compareClassNames)).toEqual([
      'Alpha',
      'grade 1 boys',
      'Grade 2 Boys',
      'Grade 10 Boys',
    ])
  })
})

describe('Sunday School grade ordering', () => {
  it('sorts classes by grade before using their names', () => {
    const classes = [
      { level: SundaySchoolLevel.GRADE_10, name: '10th Grade' },
      { level: SundaySchoolLevel.GRADE_12, name: '12th Grade' },
      { level: SundaySchoolLevel.GRADE_9, name: '9th Grade' },
      { level: SundaySchoolLevel.GRADE_11, name: '11th Grade' },
      { level: SundaySchoolLevel.COLLEGE_GRAD, name: 'College & Grad' },
    ]

    expect(classes.sort(compareClassesByLevelAndName).map(item => item.name)).toEqual([
      '9th Grade',
      '10th Grade',
      '11th Grade',
      '12th Grade',
      'College & Grad',
    ])
  })

  it('sorts age groups by the first grade they contain', () => {
    const groups = [
      { name: 'High School', levels: [SundaySchoolLevel.GRADE_9] },
      { name: 'Elementary', levels: [SundaySchoolLevel.GRADE_1] },
      { name: 'Middle School', levels: [SundaySchoolLevel.GRADE_6] },
    ]

    expect(groups.sort(compareAgeGroupsByLevel).map(group => group.name)).toEqual([
      'Elementary',
      'Middle School',
      'High School',
    ])
  })
})
