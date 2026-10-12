import { RoleTag, type UserRole } from '@prisma/client'
import type { SundaySchoolAssignmentSummary } from '@/lib/sunday-school-user-assignments'
import type { AuthorizationContext } from '@/lib/authorization'

export interface ContactBookEntry {
  id: string
  name: string
  email: string
  phone: string | null
  role: UserRole
  roleAssignments: { tag: RoleTag }[]
  sundaySchoolServing: SundaySchoolAssignmentSummary[]
}

export interface ContactBookResponse {
  contacts: ContactBookEntry[]
  total: number
  page: number
  pageSize: number
}

export const CONTACT_BOOK_PAGE_SIZE = 50

export function canReadContactBook(context: AuthorizationContext): boolean {
  return !context.disabled && !context.roleTags.has(RoleTag.SUPER_ADMIN) && context.canAccessContactBook === true
}
