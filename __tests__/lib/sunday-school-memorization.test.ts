import { describe, expect, it } from 'vitest'
import {
  isValidMemorizationScore,
  summarizeMemorizationScores,
  validateMemorizationInput,
  validateScoreRecords,
} from '@/lib/sunday-school-memorization'

describe('memorization validation', () => {
  it('requires a title and normalizes optional fields', () => {
    expect(validateMemorizationInput({ title: '  ' }).ok).toBe(false)
    const ok = validateMemorizationInput({ title: ' Psalm 23 ', instructions: ' ', dueDate: '2026-11-01' })
    expect(ok).toEqual({ ok: true, value: { title: 'Psalm 23', instructions: null, dueDate: new Date('2026-11-01T00:00:00.000Z') } })
  })

  it('rejects impossible dates and overlong titles', () => {
    expect(validateMemorizationInput({ title: 'x', dueDate: '2026-02-31' }).ok).toBe(false)
    expect(validateMemorizationInput({ title: 'x'.repeat(121) }).ok).toBe(false)
  })

  it('accepts only whole scores from 0 to 100', () => {
    for (const good of [0, 1, 100]) expect(isValidMemorizationScore(good)).toBe(true)
    for (const bad of [-1, 101, 7.5, '90', NaN, null]) expect(isValidMemorizationScore(bad)).toBe(false)
  })

  it('validates score records', () => {
    expect(validateScoreRecords([{ childId: 'a', score: 90, notes: ' great ' }, { childId: 'b', score: null }])).toEqual({
      ok: true,
      value: [{ childId: 'a', score: 90, notes: 'great' }, { childId: 'b', score: null, notes: null }],
    })
    expect(validateScoreRecords([{ childId: 'a', score: 101 }]).ok).toBe(false)
    expect(validateScoreRecords([{ childId: 'a', score: 1 }, { childId: 'a', score: 2 }]).ok).toBe(false)
    expect(validateScoreRecords('nope').ok).toBe(false)
  })

  it('summarizes scores', () => {
    expect(summarizeMemorizationScores([80, 91, null], 4)).toEqual({ recorded: 2, notRecorded: 2, average: 86 })
    expect(summarizeMemorizationScores([], 0).average).toBeNull()
  })
})
