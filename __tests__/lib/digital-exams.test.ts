import { describe, expect, it } from 'vitest'
import { RoleTag } from '@prisma/client'
import { canAnswer, eligibleYear, examPermissions, gradeAnswers, staleContact, validAnswer, validateConfiguration } from '@/lib/digital-exams'
import type { AuthorizationContext } from '@/lib/authorization'
const context = (tags: RoleTag[], readOnly = false, disabled = false): AuthorizationContext => ({ userId: 'user', roleTags: new Set(tags), readOnly, disabled, sundaySchoolYearId: null, prepStudentScope: { kind: 'none' }, sundaySchoolClassScope: { kind: 'none' }, guardianChildScope: { kind: 'none' }, ownSundaySchoolChildId: null })

describe('digital exam rules', () => {
  it('accepts mixed four and five choice questions and rejects an invalid key', () => {
    const counts = Array(50).fill(4); counts[8] = 5
    const key = Array(50).fill('A'); key[8] = 'E'
    expect(validateConfiguration(counts, key)).toEqual({ choiceCounts: counts, answerKey: key })
    counts[8] = 4
    expect(() => validateConfiguration(counts, key)).toThrow('valid answer key')
    expect(() => validateConfiguration(Array(49).fill(4), key)).toThrow('all 50')
  })
  it('validates answer range, fifth choices, and clearing', () => {
    const counts = Array(50).fill(4); counts[0] = 5
    expect(validAnswer(0, 'E', counts)).toBe(true)
    expect(validAnswer(1, 'E', counts)).toBe(false)
    expect(validAnswer(49, '', counts)).toBe(true)
    for (const q of [-1, 50, 0.5, '0']) expect(validAnswer(q, 'A', counts)).toBe(false)
  })
  it('grades blanks as incorrect with equal weights', () => {
    expect(gradeAnswers(['A', '', 'C', 'D'], ['A', 'B', 'B', 'D'])).toBe(2)
  })
  it('allows priests to monitor but not write, and denies Sunday School-only users', () => {
    expect(examPermissions(context([RoleTag.PRIEST], true))).toEqual({ staff: true, manage: false, student: false })
    expect(examPermissions(context([RoleTag.SUPER_ADMIN, RoleTag.PRIEST], true)).manage).toBe(false)
    expect(examPermissions(context([RoleTag.SERVANTS_PREP_SERVANT])).manage).toBe(true)
    expect(examPermissions(context([RoleTag.SUNDAY_SCHOOL_SERVANT]))).toEqual({ staff: false, manage: false, student: false })
    expect(examPermissions(context([RoleTag.SERVANTS_PREP_STUDENT], false, true)).student).toBe(false)
  })
  it('requires an active attempt, open exam, and fresh contact to answer', () => {
    const now = Date.now()
    expect(staleContact(new Date(now - 30000), now)).toBe(false)
    expect(staleContact(new Date(now - 30001), now)).toBe(true)
    expect(canAnswer('ACTIVE', 'OPEN', new Date(now), now)).toBe(true)
    for (const [attempt, exam] of [['PAUSED', 'OPEN'], ['SUBMITTED', 'OPEN'], ['ACTIVE', 'CLOSED']]) expect(canAnswer(attempt, exam, new Date(now), now)).toBe(false)
    expect(canAnswer('ACTIVE', 'OPEN', new Date(now - 30001), now)).toBe(false)
    expect(eligibleYear('YEAR_1', 'YEAR_2')).toBe(false)
    expect(eligibleYear('YEAR_1', 'BOTH')).toBe(true)
  })
})
