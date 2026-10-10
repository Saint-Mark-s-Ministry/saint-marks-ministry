import { describe, expect, it } from 'vitest'
import {
  classBelongsToElementaryBand,
  getHomeworkDueDate,
  isHomeworkCompletionStatus,
  summarizeHomeworkStatuses,
  validateHomeworkResources,
} from '@/lib/sunday-school-homework'

describe('Sunday School homework helpers', () => {
  it('uses the following weekly meeting as the due date', () => {
    expect(getHomeworkDueDate('2026-10-03').toISOString()).toBe('2026-10-10T00:00:00.000Z')
  })

  it('follows the Elementary band instead of a hard-coded grade list', () => {
    const bands = [{ sundaySchoolYearId: 'year-1', levels: ['GRADE_4', 'GRADE_6'] as const }]
    expect(classBelongsToElementaryBand(
      { sundaySchoolYearId: 'year-1', level: 'GRADE_6' },
      bands.map(band => ({ ...band, levels: [...band.levels] })),
    )).toBe(true)
    expect(classBelongsToElementaryBand(
      { sundaySchoolYearId: 'year-1', level: 'GRADE_5' },
      bands.map(band => ({ ...band, levels: [...band.levels] })),
    )).toBe(false)
  })

  it('prefers a year-bound band over the legacy fallback', () => {
    expect(classBelongsToElementaryBand(
      { sundaySchoolYearId: 'year-1', level: 'GRADE_5' },
      [
        { sundaySchoolYearId: null, levels: ['GRADE_5'] },
        { sundaySchoolYearId: 'year-1', levels: ['GRADE_4'] },
      ],
    )).toBe(false)
  })

  it('counts unrecorded work separately and excludes it from the rate', () => {
    expect(summarizeHomeworkStatuses(['COMPLETED', 'NOT_COMPLETED', null, undefined])).toEqual({
      completed: 1,
      notCompleted: 1,
      notRecorded: 2,
      completionRate: 50,
    })
    expect(summarizeHomeworkStatuses([null])).toEqual({
      completed: 0,
      notCompleted: 0,
      notRecorded: 1,
      completionRate: null,
    })
  })

  it('accepts only completion statuses and safe named web links', () => {
    expect(isHomeworkCompletionStatus('COMPLETED')).toBe(true)
    expect(isHomeworkCompletionStatus('NOT_RECORDED')).toBe(false)
    expect(validateHomeworkResources([{ title: 'Worksheet', url: 'https://example.com/work' }]).ok).toBe(true)
    expect(validateHomeworkResources([{ title: 'Bad', url: 'javascript:alert(1)' }]).ok).toBe(false)
  })
})
