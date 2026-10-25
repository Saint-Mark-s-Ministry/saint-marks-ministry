import { describe, expect, it } from 'vitest'
import { matchPrepStudentsToRoster, type PrepRosterChild, type PrepRosterStudent } from '@/lib/servants-prep-roster-matching'

const student: PrepRosterStudent = {
  id: 'prep-1', name: 'Mina Mark',
  registration: { grade: 'GRADE_11', birthDate: '2009-03-02' },
}
const child: PrepRosterChild = {
  id: 'child-1', firstName: 'Mina', lastName: 'Mark', level: 'GRADE_11',
  birthDate: '2009-03-02', userId: null,
}
const match = (students = [student], children = [child]) => matchPrepStudentsToRoster(students, children)

describe('Prep student roster identity matching', () => {
  it('accepts a unique full name, birth date and grade, ignoring name case and spacing', () => {
    expect(match([{ ...student, name: '  MINA   mark ' }])[0].status).toBe('ready')
  })

  it.each([
    { ...child, birthDate: null },
    { ...child, birthDate: '2009-04-02' },
    { ...child, level: 'GRADE_12' as const },
    { ...child, userId: 'another-account' },
  ])('requires review for incomplete or conflicting evidence: %o', candidate => {
    expect(match([student], [candidate])[0].status).toBe('review')
  })

  it('requires review for duplicate names on either side', () => {
    expect(match([student], [child, { ...child, id: 'child-2' }])[0].status).toBe('review')
    expect(match([student, { ...student, id: 'prep-2' }]).every(row => row.status === 'review')).toBe(true)
  })

  it('preserves existing links even when names or grades differ', () => {
    expect(match([student], [{ ...child, firstName: 'Different', userId: student.id }])[0].status).toBe('linked')
  })

  it('reports missing matches and ignores students outside grades 11 and 12', () => {
    expect(match([student], [])[0].status).toBe('unmatched')
    expect(match([{ ...student, registration: { ...student.registration!, grade: 'GRADE_9' } }], [])).toEqual([])
  })

  it('surfaces high school roster matches when Prep registration grade is old or missing', () => {
    expect(match([{ ...student, registration: null }])[0].status).toBe('review')
    expect(match([{ ...student, registration: { ...student.registration!, grade: 'GRADE_10' } }])[0].status).toBe('review')
  })
})
