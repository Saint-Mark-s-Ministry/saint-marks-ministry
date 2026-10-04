import { Prisma, RoleTag, UserRole } from '@prisma/client'
import { SUNDAY_SCHOOL_ASSIGNABLE_ROLES } from '@/lib/roles'

/**
 * Active accounts that may hold a Sunday School assignment.
 *
 * Keep pickers and assignment validation on the same rule: mentors and
 * Servants Prep leaders may also serve, while a Super Admin must carry the
 * explicit Sunday School servant tag. Priests remain read-only.
 */
export const sundaySchoolAssignableUserWhere = {
  isDisabled: false,
  OR: [
    { role: { in: SUNDAY_SCHOOL_ASSIGNABLE_ROLES } },
    {
      role: UserRole.SUPER_ADMIN,
      roleAssignments: {
        some: {
          tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
          revokedAt: null,
        },
      },
    },
  ],
} satisfies Prisma.UserWhereInput
