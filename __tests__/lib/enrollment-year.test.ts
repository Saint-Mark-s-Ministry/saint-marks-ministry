import { describe, expect, it } from 'vitest'
import { applicableExamYears, resolveEnrollmentYear } from '@/lib/enrollment-year'
import { eligibleYear } from '@/lib/digital-exams'

const regular = { isAsyncStudent: false, yearLevel: 'YEAR_1' as const }
const asyncStudent = { isAsyncStudent: true, yearLevel: null }

describe('enrollment attendance mode and year', () => {
  it('clears the cohort when switching to async', () => {
    expect(resolveEnrollmentYear(regular, { isAsyncStudent: true })).toBeNull()
  })
  it('requires an explicit year when switching back to in-person', () => {
    expect(() => resolveEnrollmentYear(asyncStudent, { isAsyncStudent: false })).toThrow('Choose Year 1 or Year 2')
    expect(resolveEnrollmentYear(asyncStudent, { isAsyncStudent: false, yearLevel: 'YEAR_2' })).toBe('YEAR_2')
  })
  it('rejects assigning a cohort to an async student', () => {
    expect(() => resolveEnrollmentYear(asyncStudent, { yearLevel: 'YEAR_1' })).toThrow('Async students do not have a year')
    expect(() => resolveEnrollmentYear(regular, { isAsyncStudent: true, yearLevel: 'YEAR_1' })).toThrow('Async students do not have a year')
  })
  it('rejects missing or invalid in-person years and non-boolean async status', () => {
    for (const yearLevel of [null, '', 'BOTH', 'YEAR_3']) {
      expect(() => resolveEnrollmentYear(regular, { yearLevel })).toThrow('Choose Year 1 or Year 2')
    }
    expect(() => resolveEnrollmentYear(regular, { isAsyncStudent: 'false' })).toThrow('Async status must be true or false')
  })
  it('preserves a valid in-person year on unrelated edits', () => {
    expect(resolveEnrollmentYear(regular, {})).toBe('YEAR_1')
    expect(resolveEnrollmentYear(asyncStudent, {})).toBeNull()
  })
})

describe('async curriculum access', () => {
  it('includes both curriculum years for async exams and makeups', () => {
    expect(applicableExamYears(null, true)).toEqual(['YEAR_1', 'YEAR_2', 'BOTH'])
    for (const year of ['YEAR_1', 'YEAR_2', 'BOTH']) expect(eligibleYear(null, year, true)).toBe(true)
  })
  it('keeps regular cohort restrictions and Year 2 makeup access', () => {
    expect(applicableExamYears('YEAR_1', false)).toEqual(['YEAR_1', 'BOTH'])
    expect(applicableExamYears('YEAR_2', false)).toEqual(['YEAR_2', 'BOTH'])
    expect(applicableExamYears('YEAR_2', false, true)).toEqual(['YEAR_1', 'YEAR_2', 'BOTH'])
    expect(eligibleYear('YEAR_1', 'YEAR_2')).toBe(false)
    expect(eligibleYear(null, 'BOTH')).toBe(false)
    expect(applicableExamYears(null, false)).toEqual([])
  })
})
