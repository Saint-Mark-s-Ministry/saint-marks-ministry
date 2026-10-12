import { describe, expect, it } from 'vitest'
import type { ContactBookEntry } from '@/lib/contact-book'
import { filterContactBook } from '@/lib/contact-book-filters'

const defaults = { search: '', role: '', grade: '', sort: 'name' } as const
const contacts: ContactBookEntry[] = [
  { id: '1', name: 'Zoe', email: 'zoe@example.com', phone: '555-1234', role: 'SERVANT',
    roleAssignments: [{ tag: 'SUNDAY_SCHOOL_SERVANT' }, { tag: 'PARENT' }],
    sundaySchoolServing: [{ id: 'band', authority: 'COORDINATOR', classId: null, ageGroupId: 'high', class: null,
      ageGroup: { id: 'high', name: 'High School', levels: ['GRADE_12', 'GRADE_11'] } }] },
  { id: '2', name: 'Anna', email: 'anna@example.com', phone: null, role: 'MENTOR', roleAssignments: [], sundaySchoolServing: [] },
  { id: '3', name: 'Mina', email: 'mina@example.com', phone: null, role: 'SERVANT', roleAssignments: [],
    sundaySchoolServing: [{ id: 'class', authority: 'SERVANT', classId: '2', ageGroupId: null, ageGroup: null,
      class: { id: '2', name: 'St. Mary', level: 'GRADE_2' } }] },
  { id: '4', name: 'John', email: 'john@example.com', phone: null, role: 'SERVANT', roleAssignments: [],
    sundaySchoolServing: [{ id: 'college', authority: 'SERVANT', classId: 'college', ageGroupId: null, ageGroup: null,
      class: { id: 'college', name: 'College', level: 'COLLEGE' } }] },
]

describe('contact book filtering and ordering', () => {
  it('sorts by grade, using the earliest assigned grade and putting unassigned contacts last', () => {
    expect(filterContactBook(contacts, { ...defaults, sort: 'grade' }).map(contact => contact.name))
      .toEqual(['Mina', 'Zoe', 'John', 'Anna'])
    expect(contacts.map(contact => contact.name)).toEqual(['Zoe', 'Anna', 'Mina', 'John'])
  })

  it('matches every grade in an age-group assignment and combines filters', () => {
    expect(filterContactBook(contacts, { ...defaults, grade: 'GRADE_12', role: 'PARENT', search: ' ZOE ' }))
      .toEqual([contacts[0]])
    expect(filterContactBook(contacts, { ...defaults, grade: 'GRADE_12', role: 'PRIEST' })).toEqual([])
  })

  it('searches names, emails, and phones without case sensitivity', () => {
    for (const search of ['ZOE', 'ZOE@EXAMPLE', '555-1234']) {
      expect(filterContactBook(contacts, { ...defaults, search })).toEqual([contacts[0]])
    }
  })

  it('filters unassigned contacts and normalizes legacy college levels', () => {
    expect(filterContactBook(contacts, { ...defaults, grade: 'UNASSIGNED' })).toEqual([contacts[1]])
    expect(filterContactBook(contacts, { ...defaults, grade: 'COLLEGE_GRAD' })).toEqual([contacts[3]])
  })

  it('uses all active role tags with a fallback for legacy users and mentors', () => {
    expect(filterContactBook(contacts, { ...defaults, role: 'MENTOR' })).toEqual([contacts[1]])
    expect(filterContactBook(contacts, { ...defaults, role: 'SUNDAY_SCHOOL_SERVANT' })).toHaveLength(3)
    expect(filterContactBook([{ ...contacts[0], role: 'PRIEST' }], { ...defaults, role: 'PRIEST' })).toEqual([])
  })

  it('sorts names alphabetically and uses ids to break ties', () => {
    expect(filterContactBook(contacts, defaults).map(contact => contact.name)).toEqual(['Anna', 'John', 'Mina', 'Zoe'])
    expect(filterContactBook([{ ...contacts[1], id: 'z' }, { ...contacts[1], id: 'a' }], defaults).map(contact => contact.id)).toEqual(['a', 'z'])
  })
})
