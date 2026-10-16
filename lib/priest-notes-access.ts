import { RoleTag } from '@prisma/client'
import type { AuthorizationContext } from '@/lib/authorization'

// Confidential notes are excluded from Super Admin access, including View as.
// Non-priest authors may still read only their own submissions; the route
// enforces that restriction in its database query.
export function canReadPrivatePriestNotes(
  context: Pick<AuthorizationContext, 'disabled' | 'roleTags'>,
  impersonating = false,
): boolean {
  return !context.disabled && !impersonating && !context.roleTags.has(RoleTag.SUPER_ADMIN)
}
