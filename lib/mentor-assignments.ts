import type { Prisma } from '@prisma/client'
import { legacyRoleForTags } from '@/lib/role-tags'

/** Keep the existing role-based dashboard in sync during the tag migration. */
export async function syncMentorCompatibilityRoles(
  tx: Prisma.TransactionClient,
  userIds: Iterable<string>
): Promise<void> {
  for (const id of new Set(userIds)) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id },
      select: {
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
        },
        mentorAssignments: {
          where: { endedAt: null, studentEnrollment: { status: 'ACTIVE' } },
          select: { id: true },
          take: 1,
        },
      },
    })
    const role = legacyRoleForTags(user.roleAssignments.map(({ tag }) => tag), user.role, {
      hasActiveMentorAssignment: user.mentorAssignments.length > 0,
    })
    if (role !== user.role) {
      await tx.user.update({ where: { id }, data: { role } })
    }
  }
}
