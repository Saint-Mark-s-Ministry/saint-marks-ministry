import { RoleTag, UserRole } from '@prisma/client'

// Always pass a principal loaded from the database, never session claims.
export function hasViewAsAccess(actor: {
  role: UserRole
  isDisabled: boolean
  mustChangePassword?: boolean
  canUseViewAs?: boolean
  roleAssignments: { tag: RoleTag }[]
} | null | undefined): boolean {
  if (!actor || actor.isDisabled || actor.mustChangePassword) return false
  const tags = new Set(actor.roleAssignments.map(grant => grant.tag))
  return (actor.role === UserRole.SUPER_ADMIN && tags.has(RoleTag.SUPER_ADMIN)) ||
    actor.canUseViewAs === true
}
