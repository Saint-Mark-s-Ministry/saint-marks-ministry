import { describe, expect, it } from 'vitest'
import { buildScheduleAssignments, isValidScheduleMode } from '@/lib/sunday-school-scheduler'

const servants = [
  { id: 's1', name: 'Alice' },
  { id: 's2', name: 'Bob' },
  { id: 's3', name: 'Cara' },
]

function lessons(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `l${i + 1}`,
    sundayDate: `2026-09-${String(6 + i * 7).padStart(2, '0')}`,
  }))
}

describe('isValidScheduleMode', () => {
  it('accepts only the two real modes', () => {
    expect(isValidScheduleMode('one-each')).toBe(true)
    expect(isValidScheduleMode('fill-year')).toBe(true)
    expect(isValidScheduleMode('every-week')).toBe(false)
    expect(isValidScheduleMode(undefined)).toBe(false)
  })
})

describe('buildScheduleAssignments', () => {
  it('one-each: gives every servant exactly one of the earliest dates, then stops (happy path)', () => {
    const result = buildScheduleAssignments(servants, lessons(10), 'one-each')
    expect(result).toHaveLength(3)
    expect(result.map((a) => a.servantId)).toEqual(['s1', 's2', 's3'])
    expect(result.map((a) => a.lessonId)).toEqual(['l1', 'l2', 'l3'])
  })

  it('fill-year: assigns every remaining date, cycling the pool repeatedly', () => {
    const result = buildScheduleAssignments(servants, lessons(7), 'fill-year')
    expect(result).toHaveLength(7)
    expect(result.map((a) => a.servantId)).toEqual(['s1', 's2', 's3', 's1', 's2', 's3', 's1'])
  })

  it('one-each with fewer empty dates than servants only assigns what exists, never invents a date (highest-risk path)', () => {
    const result = buildScheduleAssignments(servants, lessons(2), 'one-each')
    expect(result).toHaveLength(2)
    expect(result.map((a) => a.servantId)).toEqual(['s1', 's2'])
  })

  it('returns nothing for an empty pool or an empty lesson list, rather than throwing', () => {
    expect(buildScheduleAssignments([], lessons(5), 'fill-year')).toEqual([])
    expect(buildScheduleAssignments(servants, [], 'fill-year')).toEqual([])
  })

  it('never touches a lesson not passed in — the caller is responsible for excluding already-assigned ones', () => {
    const result = buildScheduleAssignments(servants, lessons(1), 'fill-year')
    expect(result).toEqual([{ lessonId: 'l1', sundayDate: '2026-09-06', servantId: 's1', servantName: 'Alice' }])
  })
})
