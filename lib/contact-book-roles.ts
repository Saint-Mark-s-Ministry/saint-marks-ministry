import type { RoleTag, UserRole } from '@prisma/client'
import { roleTagForLegacyRole } from './role-tags'
import type { SundaySchoolAssignmentSummary } from './sunday-school-user-assignments'

/** Directory roles describe ministry participation, rather than application access. */
export const CONTACT_BOOK_ROLE_OPTIONS = [
  { value: 'SUNDAY_SCHOOL_COORDINATOR', label: 'Sunday School Coordinator' },
  { value: 'SUNDAY_SCHOOL_SERVANT', label: 'Sunday School Servant' },
  { value: 'SERVANTS_PREP_SERVANT', label: 'Servants Prep Servant' },
  { value: 'MENTOR', label: 'Mentor' },
  { value: 'PRIEST', label: 'Priest' },
  { value: 'PARENT', label: 'Parent' },
  { value: 'SERVANTS_PREP_STUDENT', label: 'Servants Prep Student' },
  { value: 'SUNDAY_SCHOOL_STUDENT', label: 'Sunday School Student' },
] as const

export type ContactBookRole = typeof CONTACT_BOOK_ROLE_OPTIONS[number]['value']

export function getContactBookRoles(contact: {
  role: UserRole
  roleAssignments: { tag: RoleTag }[]
  sundaySchoolServing: SundaySchoolAssignmentSummary[]
  mentorAssignments: { id: string }[]
}): ContactBookRole[] {
  const tags = new Set(contact.roleAssignments.map(assignment => assignment.tag))
  if (tags.size === 0) {
    const legacyTag = roleTagForLegacyRole(contact.role)
    if (legacyTag) tags.add(legacyTag)
  }
  const assignments = contact.sundaySchoolServing.filter(assignment => assignment.class || assignment.ageGroup)
  const coordinator = assignments.some(assignment => assignment.authority === 'COORDINATOR')
  const servant = assignments.some(assignment => assignment.authority === 'SERVANT')
  const roles = new Set<ContactBookRole>()
  if (coordinator) roles.add('SUNDAY_SCHOOL_COORDINATOR')
  if (servant || (!coordinator && tags.has('SUNDAY_SCHOOL_SERVANT'))) roles.add('SUNDAY_SCHOOL_SERVANT')
  if (contact.mentorAssignments.length > 0) roles.add('MENTOR')
  for (const tag of ['PRIEST', 'PARENT', 'SERVANTS_PREP_SERVANT', 'SERVANTS_PREP_STUDENT', 'SUNDAY_SCHOOL_STUDENT'] as const) {
    if (tags.has(tag)) roles.add(tag)
  }
  return CONTACT_BOOK_ROLE_OPTIONS.filter(option => roles.has(option.value)).map(option => option.value)
}
