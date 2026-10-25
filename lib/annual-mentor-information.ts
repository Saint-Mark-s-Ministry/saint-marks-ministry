import { NotificationType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requiresAnnualMentorUpdate } from '@/lib/annual-mentor-requirement'

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
