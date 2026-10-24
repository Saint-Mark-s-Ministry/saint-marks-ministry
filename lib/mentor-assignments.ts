import type { Prisma } from '@prisma/client'
import { legacyRoleForTags } from '@/lib/role-tags'

export const YEAR_TWO_MENTOR_RESET = { mentorId: null, mentorName: null, mentorPhone: null }

/** End current access while retaining the assignment and application history. */
export async function resetYearTwoMentors(
  tx: Prisma.TransactionClient,
  enrollments: Array<{ id: string; studentId: string; mentorId: string | null }>,
  actorUserId: string | null,
  academicYearId: string | null,
) {
  if (!enrollments.length) return
  const ids = enrollments.map(enrollment => enrollment.id)
  const assignments = await tx.mentorAssignment.findMany({
    where: { studentEnrollmentId: { in: ids }, endedAt: null },
    select: { mentorUserId: true },
  })
  await tx.studentEnrollment.updateMany({ where: { id: { in: ids } }, data: YEAR_TWO_MENTOR_RESET })
  await tx.mentorAssignment.updateMany({
    where: { studentEnrollmentId: { in: ids }, endedAt: null },
    data: { endedAt: new Date(), endedById: actorUserId, endReason: 'Promoted to Year 2' },
  })
  if (academicYearId) {
    await tx.annualMentorInformation.deleteMany({
      where: { studentId: { in: enrollments.map(enrollment => enrollment.studentId) }, academicYearId },
    })
    await tx.notification.deleteMany({ where: {
      type: 'ANNOUNCEMENT',
      AND: [
        { metadata: { path: ['kind'], equals: 'annualMentorReview' } },
        { metadata: { path: ['academicYearId'], equals: academicYearId } },
        { OR: enrollments.map(enrollment => ({ metadata: { path: ['studentId'], equals: enrollment.studentId } })) },
      ],
    } })
  }
  await syncMentorCompatibilityRoles(tx, [
    ...enrollments.flatMap(enrollment => enrollment.mentorId ? [enrollment.mentorId] : []),
    ...assignments.map(assignment => assignment.mentorUserId),
  ])
}

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
