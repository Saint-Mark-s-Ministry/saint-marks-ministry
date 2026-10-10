import type { AuthorizationContext } from '@/lib/authorization'

export interface ContactBookEntry {
  id: string
  name: string
  email: string
  phone: string | null
}

export interface ContactBookResponse {
  contacts: ContactBookEntry[]
  total: number
  page: number
  pageSize: number
}

export const CONTACT_BOOK_PAGE_SIZE = 50

export function canReadContactBook(context: AuthorizationContext): boolean {
  return !context.disabled && context.canAccessContactBook === true
}
