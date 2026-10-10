import webpush from 'web-push'
import { prisma } from './prisma'
import { NotificationType, Prisma, RoleTag, SundaySchoolLevel, YearLevel } from '@prisma/client'
import { getChildRegistrationReviewerIds } from './sunday-school-access'

// Configure VAPID keys for web push
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@servantsprep.app'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

interface NotificationPayload {
  title: string
  body: string
  url?: string
  tag?: string
  notificationId?: string
}

/**
 * Send push notification to a specific user (all their subscriptions)
 */
async function sendPushToUser(userId: string, payload: NotificationPayload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  })

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        )
      } catch (error: unknown) {
        // If subscription is expired/invalid, remove it
        if (
          error instanceof webpush.WebPushError &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
        }
        throw error
      }
    })
  )

  return results
}

/**
 * Create an in-app notification and optionally send push
 */
async function createNotification({
  userId,
  type,
  title,
  body,
  url,
  metadata,
  sendPush = true,
}: {
  userId: string
  type: NotificationType
  title: string
  body: string
  url?: string
  metadata?: Prisma.InputJsonValue
  sendPush?: boolean
}) {
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, url, metadata: metadata ?? Prisma.JsonNull },
  })

  if (sendPush) {
    sendPushToUser(userId, {
      title,
      body,
      url: url || '/',
      tag: type,
      notificationId: notification.id,
    }).catch(() => {
      // Push delivery is best-effort
    })
  }

  return notification
}

/**
 * Create notifications for multiple users
 */
async function createNotifications({
  userIds,
  type,
  title,
  body,
  url,
  metadata,
  sendPush = true,
}: {
  userIds: string[]
  type: NotificationType
  title: string
  body: string
  url?: string
  metadata?: Prisma.InputJsonValue
  sendPush?: boolean
}) {
  if (userIds.length === 0) return []

  // Create in-app notifications for all users
  const notifications = await prisma.$transaction(
    userIds.map((userId) =>
      prisma.notification.create({
        data: { userId, type, title, body, url, metadata: metadata ?? Prisma.JsonNull },
      })
    )
  )

  // Send push notifications (best-effort, non-blocking)
  if (sendPush) {
    const payloads = notifications.map((n) => ({
      userId: n.userId,
      payload: {
        title,
        body,
        url: url || '/',
        tag: type,
        notificationId: n.id,
      },
    }))

    Promise.allSettled(
      payloads.map((p) => sendPushToUser(p.userId, p.payload))
    ).catch(() => {})
  }

  return notifications
}

// ============================================
// NOTIFICATION TRIGGERS
// ============================================

/**
 * Notify a student that their grade was posted
 */
export async function notifyGradePosted({
  studentId,
  studentName,
  examSection,
  percentage,
}: {
  studentId: string
  studentName: string
  examSection: string
  percentage: number
}) {
  // Notify the student
  await createNotification({
    userId: studentId,
    type: NotificationType.GRADE_POSTED,
    title: 'Grade Posted',
    body: `Your ${examSection} exam grade has been posted: ${percentage.toFixed(1)}%`,
    url: '/dashboard/student',
    metadata: { examSection, percentage },
  })

  // Notify the student's mentor
  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { studentId },
    select: { mentorId: true },
  })

  if (enrollment?.mentorId) {
    await createNotification({
      userId: enrollment.mentorId,
      type: NotificationType.GRADE_POSTED,
      title: 'Mentee Grade Posted',
      body: `${studentName}'s ${examSection} exam grade: ${percentage.toFixed(1)}%`,
      url: '/dashboard/mentor/my-mentees',
      metadata: { studentId, studentName, examSection, percentage },
    })
  }
}

/**
 * Notify mentors when attendance is recorded for their mentees
 */
export async function notifyAttendanceRecorded({
  lessonTitle,
  lessonDate,
  studentRecords,
}: {
  lessonTitle: string
  lessonDate: string
  studentRecords: Array<{ studentId: string; studentName: string; status: string }>
}) {
  // Group students by mentor
  const studentIds = studentRecords.map((r) => r.studentId)
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: { in: studentIds }, mentorId: { not: null } },
    select: { studentId: true, mentorId: true },
  })

  const mentorMentees = new Map<string, Array<{ studentName: string; status: string }>>()
  for (const enrollment of enrollments) {
    if (!enrollment.mentorId) continue
    const record = studentRecords.find((r) => r.studentId === enrollment.studentId)
    if (!record) continue

    if (!mentorMentees.has(enrollment.mentorId)) {
      mentorMentees.set(enrollment.mentorId, [])
    }
    mentorMentees.get(enrollment.mentorId)!.push({
      studentName: record.studentName,
      status: record.status,
    })
  }

  // Notify each mentor about their mentees' attendance
  for (const [mentorId, mentees] of mentorMentees) {
    const absentCount = mentees.filter((m) => m.status === 'ABSENT').length
    const lateCount = mentees.filter((m) => m.status === 'LATE').length

    let body = `Attendance recorded for "${lessonTitle}" (${lessonDate}). `
    if (absentCount > 0 || lateCount > 0) {
      const parts = []
      if (absentCount > 0) parts.push(`${absentCount} absent`)
      if (lateCount > 0) parts.push(`${lateCount} late`)
      body += `Your mentees: ${parts.join(', ')}.`
    } else {
      body += `All ${mentees.length} of your mentees were present.`
    }

    await createNotification({
      userId: mentorId,
      type: NotificationType.ATTENDANCE_RECORDED,
      title: 'Attendance Update',
      body,
      url: '/dashboard/mentor/my-mentees',
      metadata: { lessonTitle, mentees },
    })
  }
}

/**
 * Notify students about a new lesson scheduled
 */
export async function notifyLessonScheduled({
  lessonTitle,
  lessonDate,
  examSection,
  yearLevel,
}: {
  lessonTitle: string
  lessonDate: string
  examSection: string
  yearLevel?: string
}) {
  // Get all active students
  const whereClause: Prisma.StudentEnrollmentWhereInput = { isActive: true }
  if (yearLevel && Object.values(YearLevel).includes(yearLevel as YearLevel)) {
    whereClause.yearLevel = yearLevel as YearLevel
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: whereClause,
    select: { studentId: true },
  })

  const studentIds = enrollments.map((e) => e.studentId)

  await createNotifications({
    userIds: studentIds,
    type: NotificationType.LESSON_SCHEDULED,
    title: 'New Lesson Scheduled',
    body: `"${lessonTitle}" (${examSection}) scheduled for ${lessonDate}`,
    url: '/dashboard/student/lessons',
    metadata: { lessonTitle, lessonDate, examSection },
  })
}

/**
 * Notify students about a cancelled lesson
 */
export async function notifyLessonCancelled({
  lessonTitle,
  lessonDate,
  reason,
}: {
  lessonTitle: string
  lessonDate: string
  reason?: string
}) {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { isActive: true },
    select: { studentId: true },
  })

  const studentIds = enrollments.map((e) => e.studentId)

  await createNotifications({
    userIds: studentIds,
    type: NotificationType.LESSON_CANCELLED,
    title: 'Lesson Cancelled',
    body: `"${lessonTitle}" on ${lessonDate} has been cancelled${reason ? `: ${reason}` : ''}.`,
    url: '/dashboard/student/lessons',
    metadata: { lessonTitle, lessonDate, reason },
  })
}

/**
 * Notify admins about a new registration submission
 */
export async function notifyNewRegistration({
  applicantName,
  registrationId,
}: {
  applicantName: string
  registrationId: string
}) {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['SUPER_ADMIN', 'SERVANT_PREP'] },
      isDisabled: false,
    },
    select: { id: true },
  })

  await createNotifications({
    userIds: admins.map((a) => a.id),
    type: NotificationType.REGISTRATION_RECEIVED,
    title: 'New Registration',
    body: `${applicantName} has submitted a registration application.`,
    url: '/dashboard/admin/registrations',
    metadata: { registrationId, applicantName },
  })
}

/**
 * Notify student when their registration is approved/rejected
 */
export async function notifyRegistrationReviewed({
  userId,
  status,
  applicantName,
}: {
  userId: string
  status: 'APPROVED' | 'REJECTED'
  applicantName: string
}) {
  const type =
    status === 'APPROVED'
      ? NotificationType.REGISTRATION_APPROVED
      : NotificationType.REGISTRATION_REJECTED

  await createNotification({
    userId,
    type,
    title: `Registration ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`,
    body:
      status === 'APPROVED'
        ? `Welcome to the Servants Preparation Program, ${applicantName}! Your registration has been approved.`
        : `Your registration application has been reviewed. Please contact administration for details.`,
    url: status === 'APPROVED' ? '/dashboard/student' : '/',
  })
}

/**
 * Notify student when a mentor is assigned to them
 */
export async function notifyMentorAssigned({
  studentId,
  mentorName,
}: {
  studentId: string
  mentorName: string
}) {
  await createNotification({
    userId: studentId,
    type: NotificationType.MENTOR_ASSIGNED,
    title: 'Mentor Assigned',
    body: `${mentorName} has been assigned as your mentor.`,
    url: '/dashboard/student',
    metadata: { mentorName },
  })
}

/**
 * Notify a student's mentor when the student is removed from a lesson for conduct
 */
export async function notifyConductRemoval({
  studentId,
  studentName,
  lessonTitle,
  conductNote,
  removedByName,
}: {
  studentId: string
  studentName: string
  lessonTitle: string
  conductNote: string
  removedByName: string
}) {
  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { studentId },
    select: { mentorId: true },
  })

  if (enrollment?.mentorId) {
    await createNotification({
      userId: enrollment.mentorId,
      type: NotificationType.CONDUCT_REMOVAL,
      title: 'Student Removed from Lesson',
      body: `${studentName} was removed from "${lessonTitle}" by ${removedByName}. Reason: ${conductNote}`,
      url: '/dashboard/mentor/my-mentees',
      metadata: { studentId, studentName, lessonTitle, conductNote, removedByName },
    })
  }
}

/**
 * Notify SUPER_ADMINs about a new servant application
 */
async function deliverServantApplicationNotifications(
  applications: Array<{ id: string; fullName: string }>
) {
  if (applications.length === 0) return []

  const admins = await prisma.user.findMany({
    where: {
      isDisabled: false,
      OR: [
        { role: 'SUPER_ADMIN' },
        {
          roleAssignments: {
            some: { tag: RoleTag.SUPER_ADMIN, revokedAt: null },
          },
        },
      ],
    },
    select: { id: true },
  })

  if (admins.length === 0) return []

  const applicationIds = new Set(applications.map((application) => application.id))
  const existingNotifications = await prisma.notification.findMany({
    where: {
      userId: { in: admins.map((admin) => admin.id) },
      type: NotificationType.SERVANT_APPLICATION_RECEIVED,
    },
    select: {
      id: true,
      userId: true,
      metadata: true,
      isPersistent: true,
    },
  })

  const delivered = new Set<string>()
  const existingIdsToMakePersistent: string[] = []

  for (const notification of existingNotifications) {
    if (
      typeof notification.metadata !== 'object' ||
      notification.metadata === null ||
      Array.isArray(notification.metadata)
    ) continue

    const applicationId = notification.metadata.applicationId
    if (typeof applicationId !== 'string' || !applicationIds.has(applicationId)) continue

    delivered.add(`${notification.userId}:${applicationId}`)
    if (!notification.isPersistent) existingIdsToMakePersistent.push(notification.id)
  }

  const notifications = await prisma.$transaction(async (tx) => {
    const created = []

    if (existingIdsToMakePersistent.length > 0) {
      await tx.notification.updateMany({
        where: { id: { in: existingIdsToMakePersistent } },
        data: { isPersistent: true },
      })
    }

    for (const application of applications) {
      for (const admin of admins) {
        if (delivered.has(`${admin.id}:${application.id}`)) continue

        const id = `servant-application:${application.id}:${admin.id}`
        created.push(await tx.notification.upsert({
          where: { id },
          create: {
            id,
            userId: admin.id,
            type: NotificationType.SERVANT_APPLICATION_RECEIVED,
            title: 'New Servant Application',
            body: `${application.fullName} has applied to serve in Sunday School.`,
            url: '/dashboard/servants/servant-applications',
            metadata: {
              applicationId: application.id,
              applicantName: application.fullName,
            },
            isPersistent: true,
          },
          update: { isPersistent: true },
        }))
      }
    }

    return created
  })

  // In-app records are committed above. Browser push remains best-effort and
  // cannot affect whether the bell notification exists.
  void Promise.allSettled(notifications.map((notification) =>
    sendPushToUser(notification.userId, {
      title: notification.title,
      body: notification.body,
      url: notification.url || '/',
      tag: notification.type,
      notificationId: notification.id,
    })
  ))

  return notifications
}

export async function notifyNewServantApplication({
  applicantName,
  applicationId,
}: {
  applicantName: string
  applicationId: string
}) {
  return deliverServantApplicationNotifications([
    { id: applicationId, fullName: applicantName },
  ])
}

/**
 * Repair missed in-app alerts for pending applications. This runs when a
 * Super Admin loads the notification feed, so applications submitted before
 * this fix are recovered without a one-off production data script.
 */
export async function ensurePendingServantApplicationNotifications(userId: string) {
  const admin = await prisma.user.findFirst({
    where: {
      id: userId,
      isDisabled: false,
      OR: [
        { role: 'SUPER_ADMIN' },
        {
          roleAssignments: {
            some: { tag: RoleTag.SUPER_ADMIN, revokedAt: null },
          },
        },
      ],
    },
    select: { id: true },
  })

  if (!admin) return []

  const pendingApplications = await prisma.servantApplication.findMany({
    where: { status: 'PENDING' },
    select: { id: true, fullName: true },
    orderBy: { createdAt: 'asc' },
  })

  return deliverServantApplicationNotifications(pendingApplications)
}

/**
 * Create an in-app notification when a servant application is approved/rejected.
 * This does not send email or deliver login credentials.
 */
export async function notifyServantApplicationReviewed({
  userId,
  status,
  applicantName,
}: {
  userId: string
  status: 'APPROVED' | 'REJECTED'
  applicantName: string
}) {
  await createNotification({
    userId,
    type: NotificationType.SERVANT_APPLICATION_REVIEWED,
    title: `Servant Application ${status === 'APPROVED' ? 'Approved' : 'Reviewed'}`,
    body:
      status === 'APPROVED'
        ? `Welcome, ${applicantName}! Your Sunday School servant application has been approved.`
        : `Your Sunday School servant application has been reviewed. Please contact administration for details.`,
    url: status === 'APPROVED' ? '/dashboard/servants' : '/',
  })
}

/**
 * Notify SUPER_ADMINs and the relevant band coordinators about a new child
 * registration request
 */
export async function notifyChildRegistrationSubmitted({
  childName,
  requestId,
  level,
  academicYearId,
}: {
  childName: string
  requestId: string
  level: SundaySchoolLevel
  academicYearId?: string
}) {
  const reviewerIds = await getChildRegistrationReviewerIds(level, academicYearId)

  await createNotifications({
    userIds: reviewerIds,
    type: NotificationType.CHILD_REGISTRATION_RECEIVED,
    title: 'New Child Registration Request',
    body: `A parent has requested to register ${childName} for Sunday School.`,
    url: '/dashboard/servants/child-registrations',
    metadata: { requestId, childName, level },
  })
}

/**
 * Notify a parent when their child registration request is
 * approved/rejected, or sent back for changes.
 */
export async function notifyChildRegistrationReviewed({
  userId,
  status,
  childName,
  className,
  note,
}: {
  userId: string
  status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'
  childName: string
  className?: string
  note?: string | null
}) {
  await createNotification({
    userId,
    type: NotificationType.CHILD_REGISTRATION_REVIEWED,
    title:
      status === 'APPROVED'
        ? 'Child Registration Approved'
        : status === 'CHANGES_REQUESTED'
          ? 'Changes Requested'
          : 'Child Registration Reviewed',
    body:
      status === 'APPROVED'
        ? `${childName} has been placed in ${className ?? 'a Sunday School class'}.`
        : status === 'CHANGES_REQUESTED'
          ? `A coordinator needs more info about ${childName}'s registration${note ? `: ${note}` : '.'}`
          : `Your request to register ${childName} has been reviewed. Please contact a coordinator for details.`,
    url: '/dashboard/parent',
    metadata: { childName, className },
  })
}

/**
 * Notify every active priest, except the author, that a confidential Sunday
 * School visitation note is ready for review. The notification deliberately
 * excludes the child's name and the note content because push previews can be
 * visible on a locked device.
 */
export async function notifyPriestNoteCreated({
  noteId,
  visitationId,
  childId,
  submittedById,
}: {
  noteId: string
  visitationId: string
  childId: string
  submittedById: string
}) {
  const priests = await prisma.user.findMany({
    where: {
      id: { not: submittedById },
      isDisabled: false,
      roleAssignments: {
        some: {
          tag: RoleTag.PRIEST,
          revokedAt: null,
        },
      },
    },
    select: { id: true },
  })

  await createNotifications({
    userIds: priests.map((priest) => priest.id),
    type: NotificationType.PRIEST_NOTE_CREATED,
    title: 'New confidential visitation note',
    body: 'A confidential Sunday School visitation note is ready for review.',
    url: '/dashboard/servants/visitations',
    metadata: { noteId, visitationId, childId },
  })
}

/**
 * Send an announcement to users by role
 */
export async function sendAnnouncement({
  title,
  body,
  roles,
  url,
}: {
  title: string
  body: string
  roles: string[]
  url?: string
}) {
  const users = await prisma.user.findMany({
    where: {
      role: { in: roles as never },
      isDisabled: false,
    },
    select: { id: true },
  })

  await createNotifications({
    userIds: users.map((u) => u.id),
    type: NotificationType.ANNOUNCEMENT,
    title,
    body,
    url,
  })
}
