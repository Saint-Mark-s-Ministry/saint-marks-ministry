import { RoleTag, UserRole } from '@prisma/client'

export const ROLE_TAG_OPTIONS: ReadonlyArray<{
  value: RoleTag
  label: string
  description: string
}> = [
  {
    value: RoleTag.SUPER_ADMIN,
    label: 'Super Admin',
    description: 'Full access, including user access-tag administration.',
  },
  {
    value: RoleTag.PRIEST,
    label: 'Priest',
    description: 'Read-only access to every program and record.',
  },
  {
    value: RoleTag.SERVANTS_PREP_SERVANT,
    label: 'Servants Prep Servant',
    description: 'Manage Servants Prep students, mentors, attendance, and curriculum.',
  },
  {
    value: RoleTag.SERVANTS_PREP_STUDENT,
    label: 'Servants Prep Student',
    description: 'Access the student’s own Servants Prep information.',
  },
  {
    value: RoleTag.SUNDAY_SCHOOL_SERVANT,
    label: 'Sunday School Servant',
    description: 'Eligible for Sunday School; class assignments determine scope.',
  },
  {
    value: RoleTag.SUNDAY_SCHOOL_STUDENT,
    label: 'Sunday School Student',
    description: 'Access the linked child’s Sunday School information.',
  },
  {
    value: RoleTag.PARENT,
    label: 'Parent',
    description: 'Access children connected through active guardian relationships.',
  },
]

export const ROLE_TAG_VALUES = new Set<RoleTag>(ROLE_TAG_OPTIONS.map((option) => option.value))

export function getRoleTagDisplayName(tag: RoleTag): string {
  return ROLE_TAG_OPTIONS.find((option) => option.value === tag)?.label ?? tag
}

export function roleTagForLegacyRole(role: UserRole): RoleTag | null {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return RoleTag.SUPER_ADMIN
    case UserRole.PRIEST:
      return RoleTag.PRIEST
    case UserRole.SERVANT_PREP:
      return RoleTag.SERVANTS_PREP_SERVANT
    case UserRole.STUDENT:
      return RoleTag.SERVANTS_PREP_STUDENT
    case UserRole.SERVANT:
      return RoleTag.SUNDAY_SCHOOL_SERVANT
    case UserRole.PARENT:
      return RoleTag.PARENT
    case UserRole.MENTOR:
      return null
  }
}

/**
 * The application still carries one compatibility-era User.role while routes
 * cut over to normalized role tags. Choose the highest-impact compatibility
 * role deterministically so adding a tag also activates routes that have not
 * yet moved to the normalized authorization resolver. PRIEST is always first
 * because it is a read-only override.
 */
export function legacyRoleForTags(
  tags: Iterable<RoleTag>,
  currentRole: UserRole,
  options: { hasActiveMentorAssignment?: boolean } = {}
): UserRole {
  const selected = new Set(tags)

  if (selected.has(RoleTag.PRIEST)) return UserRole.PRIEST
  if (selected.has(RoleTag.SUPER_ADMIN)) return UserRole.SUPER_ADMIN
  if (selected.has(RoleTag.SERVANTS_PREP_SERVANT)) return UserRole.SERVANT_PREP

  // Mentor is intentionally assignment-derived instead of a permanent tag.
  // During the compatibility rollout, keep an actively assigned mentor on
  // the mentor dashboard even when they also participate in Sunday School.
  // Callers that have loaded current assignments should pass an explicit
  // boolean so a stale legacy MENTOR role is not preserved after mentoring
  // ends. Callers without assignment context retain the previous fallback.
  const hasMentorAccess =
    options.hasActiveMentorAssignment ?? currentRole === UserRole.MENTOR
  if (hasMentorAccess) return UserRole.MENTOR

  if (selected.has(RoleTag.SUNDAY_SCHOOL_SERVANT)) return UserRole.SERVANT
  if (selected.has(RoleTag.PARENT)) return UserRole.PARENT
  if (selected.has(RoleTag.SERVANTS_PREP_STUDENT)) return UserRole.STUDENT
  if (selected.has(RoleTag.SUNDAY_SCHOOL_STUDENT)) return UserRole.STUDENT

  return currentRole
}
