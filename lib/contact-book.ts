import { RoleTag } from '@prisma/client'
import type { SundaySchoolAssignmentSummary } from '@/lib/sunday-school-user-assignments'
import type { ContactBookRole } from '@/lib/contact-book-roles'
import type { AuthorizationContext } from '@/lib/authorization'

export interface ContactBookEntry {
  id: string
  name: string
  email: string
  phone: string | null
  profileImageUrl: string | null
  roles: ContactBookRole[]
  sundaySchoolServing: SundaySchoolAssignmentSummary[]
}

export interface ContactBookResponse {
  contacts: ContactBookEntry[]
  total: number
}

export function canReadContactBook(context: AuthorizationContext): boolean {
  return !context.disabled && !context.roleTags.has(RoleTag.SUPER_ADMIN) && context.canAccessContactBook === true
}
