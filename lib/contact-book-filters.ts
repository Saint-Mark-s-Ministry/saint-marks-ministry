import { type SundaySchoolLevel } from '@prisma/client'
import type { ContactBookEntry } from './contact-book'
import type { ContactBookRole } from './contact-book-roles'
import { LEVEL_ORDER } from './sunday-school-class'
import { getSundaySchoolAssignmentLevels } from './sunday-school-user-assignments'

export type ContactBookRoleFilter = ContactBookRole | ''
export type ContactBookGradeFilter = SundaySchoolLevel | 'UNASSIGNED' | ''
export type ContactBookSort = 'name' | 'grade'

export interface ContactBookFilters {
  search: string
  role: ContactBookRoleFilter
  grade: ContactBookGradeFilter
  sort: ContactBookSort
}

function contactLevels(contact: ContactBookEntry, role: ContactBookRoleFilter): SundaySchoolLevel[] {
  const authority = role === 'SUNDAY_SCHOOL_COORDINATOR' ? 'COORDINATOR' : role === 'SUNDAY_SCHOOL_SERVANT' ? 'SERVANT' : null
  const assignments = authority ? contact.sundaySchoolServing.filter(assignment => assignment.authority === authority) : contact.sundaySchoolServing
  return getSundaySchoolAssignmentLevels(assignments).map(level =>
    level === 'COLLEGE' || level === 'GRAD' ? 'COLLEGE_GRAD' : level
  )
}

export function filterContactBook(
  contacts: ContactBookEntry[],
  { search, role, grade, sort }: ContactBookFilters
): ContactBookEntry[] {
  const query = search.trim().toLocaleLowerCase()
  const entries = contacts.map(contact => ({ contact, levels: contactLevels(contact, role) }))
  return entries.filter(({ contact, levels }) => {
    if (query && ![contact.name, contact.email, contact.phone ?? ''].some(value =>
      value.toLocaleLowerCase().includes(query)
    )) return false
    if (role && !contact.roles.includes(role)) return false
    if (grade === 'UNASSIGNED' && levels.length > 0) return false
    if (grade && grade !== 'UNASSIGNED' && !levels.includes(grade)) return false
    return true
  }).sort((left, right) => {
    if (sort === 'grade') {
      const gradeIndex = (levels: SundaySchoolLevel[]) => levels.length
        ? Math.min(...levels.map(level => LEVEL_ORDER.indexOf(level)))
        : Number.MAX_SAFE_INTEGER
      const difference = gradeIndex(left.levels) - gradeIndex(right.levels)
      if (difference) return difference
    }
    return left.contact.name.localeCompare(right.contact.name) || left.contact.id.localeCompare(right.contact.id)
  }).map(({ contact }) => contact)
}
