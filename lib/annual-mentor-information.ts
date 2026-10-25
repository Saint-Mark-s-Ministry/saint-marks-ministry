import { NotificationType, RoleTag, type Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requiresAnnualMentorUpdate } from '@/lib/annual-mentor-requirement'

/** Persist staff review work together with the form; failures roll back both. */
export async function queueAnnualMentorReview(
  tx: Prisma.TransactionClient,
  submission: { studentId: string; studentName: string; academicYearId: string; id: string; updatedAt: Date },
) {
  const reviewers = await tx.user.findMany({
    where: {
      isDisabled: false,
      roleAssignments: {
        some: { tag: { in: [RoleTag.SERVANTS_PREP_SERVANT, RoleTag.SUPER_ADMIN] }, revokedAt: null },
        none: { tag: RoleTag.PRIEST, revokedAt: null },
      },
    },
    select: { id: true },
  })
  // Replace the previous version's review task instead of accumulating stale alerts.
  await tx.notification.deleteMany({ where: {
    type: NotificationType.ANNOUNCEMENT,
    AND: [
      { metadata: { path: ['kind'], equals: 'annualMentorReview' } },
      { metadata: { path: ['studentId'], equals: submission.studentId } },
      { metadata: { path: ['academicYearId'], equals: submission.academicYearId } },
    ],
  } })
  if (!reviewers.length) return
  await tx.notification.createMany({
    data: reviewers.map(reviewer => ({
      id: `annual-mentor-review:${submission.id}:${submission.updatedAt.getTime()}:${reviewer.id}`,
      userId: reviewer.id,
      type: NotificationType.ANNOUNCEMENT,
      title: 'Mentor form ready to verify',
      body: `${submission.studentName} submitted their Year 2 mentor form. Verify it on the student roster.`,
      url: `/dashboard/admin/enrollments?studentId=${encodeURIComponent(submission.studentId)}`,
      isPersistent: true,
      metadata: { kind: 'annualMentorReview', studentId: submission.studentId, academicYearId: submission.academicYearId },
    })),
    skipDuplicates: true,
  })
}

/**
 * Active Year 2 students confirm their mentor contact information each year.
 * Looking this up from current state (rather than only at promotion time)
 * also covers students promoted before this feature was deployed.
 */
export async function getAnnualMentorRequirement(userId: string) {
  const [activeYear, enrollment] = await Promise.all([
    prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    prisma.studentEnrollment.findUnique({
      where: { studentId: userId },
      select: {
        id: true,
        isActive: true,
        isAsyncStudent: true,
        yearLevel: true,
        mentorName: true,
        mentorPhone: true,
        approvalFormUrl: true,
        approvalFormFilename: true,
      },
    }),
  ])

  if (!activeYear || !enrollment || !requiresAnnualMentorUpdate(enrollment)) {
    return null
  }

  const information = await prisma.annualMentorInformation.findUnique({
    where: {
      studentId_academicYearId: {
        studentId: userId,
        academicYearId: activeYear.id,
      },
    },
  })

  return { activeYear, enrollment, information }
}

export async function ensureAnnualMentorReminder(userId: string) {
  const requirement = await getAnnualMentorRequirement(userId)
  if (!requirement || requirement.information?.reviewedAt) {
    // Reconcile reminders created under the former async-student rule. Keep
    // admission and approval-form reminders, which use the same notification type.
    await prisma.notification.deleteMany({
      where: {
        userId,
        type: NotificationType.REGISTRATION_INCOMPLETE,
        isPersistent: true,
        metadata: { path: ['kind'], equals: 'annualMentorInformation' },
      },
    })
    return
  }

  const existingReminder = await prisma.notification.findFirst({
    where: {
      userId,
      type: NotificationType.REGISTRATION_INCOMPLETE,
      isPersistent: true,
      metadata: {
        path: ['academicYearId'],
        equals: requirement.activeYear.id,
      },
    },
    select: { id: true },
  })

  if (existingReminder) return

  await prisma.notification.create({
    data: {
      userId,
      type: NotificationType.REGISTRATION_INCOMPLETE,
      title: 'Mentor Information Required',
      body: `Please confirm your mentor servant information for ${requirement.activeYear.name}. This reminder will remain until it is complete.`,
      url: '/dashboard/student/application',
      isPersistent: true,
      metadata: {
        kind: 'annualMentorInformation',
        academicYearId: requirement.activeYear.id,
        missingDetails: ['mentor servant information'],
      },
    },
  })
}
