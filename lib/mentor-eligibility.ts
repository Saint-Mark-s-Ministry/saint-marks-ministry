import { RoleTag, type Prisma, type UserRole } from '@prisma/client'
import { canBeMentor, MENTOR_ELIGIBLE_ROLES } from '@/lib/roles'

export const MENTOR_ELIGIBLE_TAGS: RoleTag[] = [
  RoleTag.SUPER_ADMIN,
  RoleTag.PRIEST,
  RoleTag.SERVANTS_PREP_SERVANT,
  RoleTag.SUNDAY_SCHOOL_SERVANT,
]

export const MENTOR_CANDIDATE_WHERE = {
  isDisabled: false,
  OR: [
    { roleAssignments: { some: { tag: { in: MENTOR_ELIGIBLE_TAGS }, revokedAt: null } } },
    // Keep never-migrated accounts and legacy mentor-only accounts working.
    // A revoked tag must not resurrect access through a stale primary role.
    { roleAssignments: { none: {} }, role: { in: MENTOR_ELIGIBLE_ROLES } },
  ],
} satisfies Prisma.UserWhereInput

export const MENTOR_CANDIDATE_SELECT = {
  role: true,
  isDisabled: true,
  roleAssignments: { select: { tag: true, revokedAt: true } },
} satisfies Prisma.UserSelect

export interface MentorCandidate {
  role: UserRole
  isDisabled: boolean
  roleAssignments: { tag: RoleTag; revokedAt: Date | null }[]
}

export function isEligibleMentorAccount(candidate: MentorCandidate | null): boolean {
  if (!candidate || candidate.isDisabled) return false
  if (candidate.roleAssignments.length === 0) return canBeMentor(candidate.role)
  return candidate.roleAssignments.some(
    ({ tag, revokedAt }) => revokedAt === null && MENTOR_ELIGIBLE_TAGS.includes(tag)
  )
}
