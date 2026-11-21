import { RoleTag } from '@prisma/client'

export function canViewPrepGuides(tags: ReadonlySet<RoleTag>): boolean {
  return tags.has(RoleTag.SUPER_ADMIN) || tags.has(RoleTag.PRIEST) || tags.has(RoleTag.SERVANTS_PREP_SERVANT)
}
