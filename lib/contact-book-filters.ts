import { type RoleTag, type SundaySchoolLevel } from '@prisma/client'
import type { ContactBookEntry } from './contact-book'
import { roleTagForLegacyRole } from './role-tags'
import { LEVEL_ORDER } from './sunday-school-class'
import { getSundaySchoolAssignmentLevels } from './sunday-school-user-assignments'

export type ContactBookRoleFilter = RoleTag | 'MENTOR' | ''
export type ContactBookGradeFilter = SundaySchoolLevel | 'UNASSIGNED' | ''
export type ContactBookSort = 'name' | 'grade'

function contactLevels(contact: ContactBookEntry): SundaySchoolLevel[] {
  return getSundaySchoolAssignmentLevels(contact.sundaySchoolServing).map(level =>
    level === 'COLLEGE' || level === 'GRAD' ? 'COLLEGE_GRAD' : level
  )
}

export function filterContactBook(
  contacts: ContactBookEntry[],
  { search, role, grade, sort }: {
    search: string
    role: ContactBookRoleFilter
    grade: ContactBookGradeFilter
    sort: ContactBookSort
  }
): ContactBookEntry[] {
  const query = search.trim().toLocaleLowerCase()
  const entries = contacts.map(contact => ({ contact, levels: contactLevels(contact) }))
  return entries.filter(({ contact, levels }) => {
    if (query && ![contact.name, contact.email, contact.phone ?? ''].some(value =>
      value.toLocaleLowerCase().includes(query)
    )) return false
    if (role === 'MENTOR' && contact.role !== 'MENTOR') return false
    if (role && role !== 'MENTOR') {
      const tags = contact.roleAssignments.map(assignment => assignment.tag)
      if (tags.length ? !tags.includes(role) : roleTagForLegacyRole(contact.role) !== role) return false
    }
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
