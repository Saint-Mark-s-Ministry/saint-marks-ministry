import { describe, expect, it } from 'vitest'
import { CONTACT_BOOK_ROLE_OPTIONS, getContactBookRoles } from '@/lib/contact-book-roles'

const base = { role: 'SUPER_ADMIN' as const, roleAssignments: [], sundaySchoolServing: [], mentorAssignments: [] }
const coordinator = { id: 'a', authority: 'COORDINATOR' as const, classId: 'first', ageGroupId: null,
  class: { id: 'first', name: 'Class 1', level: 'GRADE_1' as const }, ageGroup: null }

describe('contact book ministry roles', () => {
  it('never labels directory contacts by their administrative access', () => {
    expect(getContactBookRoles({ ...base, roleAssignments: [{ tag: 'SUPER_ADMIN' }] })).toEqual([])
    expect(CONTACT_BOOK_ROLE_OPTIONS.some(option => /admin|access/i.test(option.label))).toBe(false)
  })

  it('derives coordinator duties from assignments even for an administrator', () => {
    expect(getContactBookRoles({ ...base, roleAssignments: [{ tag: 'SUPER_ADMIN' }, { tag: 'SUNDAY_SCHOOL_SERVANT' }], sundaySchoolServing: [coordinator] }))
      .toEqual(['SUNDAY_SCHOOL_COORDINATOR'])
    expect(getContactBookRoles({ ...base, sundaySchoolServing: [{ ...coordinator, classId: null, class: null,
      ageGroupId: 'elementary', ageGroup: { id: 'elementary', name: 'Elementary', levels: ['GRADE_1'] } }] }))
      .toEqual(['SUNDAY_SCHOOL_COORDINATOR'])
  })

  it('lists both duties when someone coordinates and serves different classes', () => {
    expect(getContactBookRoles({ ...base, sundaySchoolServing: [coordinator, { ...coordinator, authority: 'SERVANT' }] }))
      .toEqual(['SUNDAY_SCHOOL_COORDINATOR', 'SUNDAY_SCHOOL_SERVANT'])
  })

  it('supports ministry membership without a class assignment and legacy accounts', () => {
    expect(getContactBookRoles({ ...base, role: 'SERVANT' })).toEqual(['SUNDAY_SCHOOL_SERVANT'])
    expect(getContactBookRoles({ ...base, roleAssignments: [{ tag: 'PARENT' }, { tag: 'SERVANTS_PREP_STUDENT' }] }))
      .toEqual(['PARENT', 'SERVANTS_PREP_STUDENT'])
    expect(getContactBookRoles({ ...base, role: 'SERVANT', roleAssignments: [{ tag: 'PRIEST' }] })).toEqual(['PRIEST'])
  })

  it('uses current mentor assignments rather than a stale legacy mentor role', () => {
    expect(getContactBookRoles({ ...base, role: 'MENTOR' })).toEqual([])
    expect(getContactBookRoles({ ...base, mentorAssignments: [{ id: 'active-mentor' }] })).toEqual(['MENTOR'])
  })
})
