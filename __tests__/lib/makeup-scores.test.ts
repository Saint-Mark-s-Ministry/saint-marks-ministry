import { describe, expect, it } from 'vitest'
import { effectiveExamResult, parseMakeupScoreInput } from '@/lib/makeup-scores'

describe('makeup exam scoring', () => {
  it('uses the highest percentage, including lower-scoring retakes and zero', () => {
    expect(effectiveExamResult(55, [40, 80, 60], 100)).toEqual({ score: 80, percentage: 80 })
    expect(effectiveExamResult(55, [40], 100)).toEqual({ score: 55, percentage: 55 })
    expect(effectiveExamResult(null, [0], 100)).toEqual({ score: 0, percentage: 0 })
  })
  it('preserves a released digital retake when paper results are corrected', () => {
    expect(effectiveExamResult(50, [60], 100, 90)).toEqual({ score: 90, percentage: 90 })
    expect(effectiveExamResult(50, [95], 100, 90)).toEqual({ score: 95, percentage: 95 })
  })
  it('normalizes different makeup totals to the original exam scale', () => {
    expect(effectiveExamResult(50, [80], 50)).toEqual({ score: 40, percentage: 80 })
  })
  it('recalculates after correcting a makeup or original grade', () => {
    expect(effectiveExamResult(50, [45, 40], 100)).toEqual({ score: 50, percentage: 50 })
    expect(effectiveExamResult(90, [45, 80], 100)).toEqual({ score: 90, percentage: 90 })
  })
})

describe('makeup score input', () => {
  const now = new Date('2026-10-09T15:00:00Z')
  const input = { studentId: 'student', version: 1, score: 0, totalPoints: 50, takenDate: '2026-10-09' }
  it('accepts both versions and a zero score', () => {
    expect(parseMakeupScoreInput(input, now)).toMatchObject({ score: 0, version: 1 })
    expect(parseMakeupScoreInput({ ...input, version: 2 }, now)).toMatchObject({ version: 2 })
  })
  it.each([3, 0, '1', null])('rejects an invalid version: %s', version => {
    expect(typeof parseMakeupScoreInput({ ...input, version }, now)).toBe('string')
  })
  it.each([-1, 51, NaN, Infinity, '20'])('rejects an invalid score: %s', score => {
    expect(typeof parseMakeupScoreInput({ ...input, score }, now)).toBe('string')
  })
  it.each([0, -1, 50.5, Infinity, 2147483648, '50'])('rejects an invalid total: %s', totalPoints => {
    expect(typeof parseMakeupScoreInput({ ...input, totalPoints }, now)).toBe('string')
  })
  it.each(['2026-02-30', '2026-10-10', 'bad'])('rejects invalid or future dates: %s', takenDate => {
    expect(typeof parseMakeupScoreInput({ ...input, takenDate }, now)).toBe('string')
  })
})
