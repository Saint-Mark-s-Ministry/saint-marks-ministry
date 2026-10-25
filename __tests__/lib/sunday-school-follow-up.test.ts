import { describe, expect, it } from 'vitest'
import { buildFollowUps, daysUntilBirthday } from '@/lib/sunday-school-follow-up'

function child(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    firstName: id,
    lastName: 'Child',
    visitationPriority: false,
    absentStreak: { weeks: 0, since: null },
    visitations: [],
    phoneCalls: [],
    ...overrides,
  }
}

const cls = (children: ReturnType<typeof child>[]) => [{ id: 'c1', name: 'Grade 3', canEdit: true, children }]

describe('Sunday School follow-up list', () => {
  it('lists children absent three meetings in a row, but not two', () => {
    const items = buildFollowUps(cls([
      child('three', { absentStreak: { weeks: 3, since: '2026-10-03' } }),
      child('two', { absentStreak: { weeks: 2, since: '2026-10-10' } }),
    ]), [], '2026-10-22')
    expect(items.map(item => item.childId)).toEqual(['three'])
    expect(items[0].reasons).toEqual(['absent'])
  })

  it('puts children nobody has contacted first, and ignores calls from before the absences began', () => {
    const items = buildFollowUps(cls([
      child('called', { absentStreak: { weeks: 5, since: '2026-09-19' }, phoneCalls: [{ calledAt: '2026-10-20T00:00:00Z', outcome: 'NO_ANSWER' }] }),
      child('old-call', { absentStreak: { weeks: 3, since: '2026-10-03' }, phoneCalls: [{ calledAt: '2026-09-01T00:00:00Z', outcome: 'CONNECTED' }] }),
      child('starred', { visitationPriority: true }),
    ]), [], '2026-10-22')
    expect(items.map(item => item.childId)).toEqual(['old-call', 'called', 'starred'])
    expect(items[0].lastContact).toBeNull()
    expect(items[1].lastContact).toEqual({ kind: 'call', date: '2026-10-20', outcome: 'NO_ANSWER' })
  })

  it('adds birthdays in the next seven days to an existing row instead of duplicating the child', () => {
    const items = buildFollowUps(
      cls([child('starred', { visitationPriority: true })]),
      [
        { id: 'starred', firstName: 'starred', lastName: 'Child', classId: 'c1', birthDate: '2018-10-24T00:00:00Z' },
        { id: 'soon', firstName: 'soon', lastName: 'Child', classId: 'c1', birthDate: '2018-10-28T00:00:00Z' },
        { id: 'later', firstName: 'later', lastName: 'Child', classId: 'c1', birthDate: '2018-10-29T00:00:00Z' },
        { id: 'elsewhere', firstName: 'elsewhere', lastName: 'Child', classId: 'other', birthDate: '2018-10-23T00:00:00Z' },
      ],
      '2026-10-22',
    )
    expect(items.map(item => [item.childId, item.reasons])).toEqual([
      ['starred', ['priority', 'birthday']],
      ['soon', ['birthday']],
    ])
  })

  it('counts days to a birthday across the new year and on Feb 29', () => {
    expect(daysUntilBirthday('2018-01-02T00:00:00Z', '2026-12-30')).toBe(3)
    expect(daysUntilBirthday('2016-02-29T00:00:00Z', '2027-02-27')).toBe(1)
    expect(daysUntilBirthday('2018-10-22T00:00:00Z', '2026-10-22')).toBe(0)
  })
})
