import { NotificationType, Prisma, RoleTag, type ExamYearLevel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendPushToUser } from '@/lib/notifications'
import { appUrl, sendEmail } from '@/lib/mail/send'
import { makeupExamBooked } from '@/lib/mail/templates'
import { formatDateUTC } from '@/lib/utils'

// Recipient subscriptions are managed on Users, alongside existing account settings.
const recipientWhere = {
  makeupExamNotifications: true,
  isDisabled: false,
  roleAssignments: { some: {
    revokedAt: null,
    tag: { in: [RoleTag.SUPER_ADMIN, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.PRIEST] },
  } },
} satisfies Prisma.UserWhereInput

interface BookingDetails {
  id: string
  studentId: string
  examId: string
  scheduledDate: Date
  student: { name: string }
  exam: {
    yearLevel: ExamYearLevel
    examDate: Date
    examSection: { displayName: string }
    academicYear: { name: string }
  }
}

interface BookingDelivery {
  notificationId: string
  userId: string
  title: string
  body: string
  url: string
  studentName: string
  examName: string
  scheduledDate: string
  previousDate?: string
}

/** Called in the booking transaction: the booking and its in-app alerts commit together. */
export async function createMakeupBookingNotifications(
  tx: Prisma.TransactionClient,
  booking: BookingDetails,
  previousDate?: Date,
): Promise<BookingDelivery[]> {
  const recipients = await tx.user.findMany({ where: recipientWhere, select: { id: true } })
  const year = booking.exam.yearLevel === 'BOTH' ? 'Both years' : booking.exam.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'
  const examName = `${booking.exam.examSection.displayName} — ${year} — ${booking.exam.academicYear.name} (exam: ${formatDateUTC(booking.exam.examDate)})`
  const scheduledDate = formatDateUTC(booking.scheduledDate)
  const previous = previousDate ? formatDateUTC(previousDate) : undefined
  const title = previous ? 'Makeup exam rescheduled' : 'Makeup exam scheduled'
  const body = previous
    ? `${booking.student.name} rescheduled ${examName} from ${previous} to ${scheduledDate}.`
    : `${booking.student.name} scheduled ${examName} for ${scheduledDate}.`
  const url = '/dashboard/admin/exams'
  const deliveries: BookingDelivery[] = []
  for (const recipient of recipients) {
    const notification = await tx.notification.create({ data: {
      userId: recipient.id, type: NotificationType.ANNOUNCEMENT, title, body, url,
      metadata: {
        kind: 'makeup-exam-booking', bookingId: booking.id,
        studentId: booking.studentId, examId: booking.examId,
        scheduledDate: booking.scheduledDate.toISOString().slice(0, 10),
        previousDate: previousDate?.toISOString().slice(0, 10) ?? null,
      },
    }, select: { id: true } })
    deliveries.push({ notificationId: notification.id, userId: recipient.id, title, body, url,
      studentName: booking.student.name, examName, scheduledDate, previousDate: previous })
  }
  return deliveries
}

/** External delivery is best-effort, after the booking and in-app alerts commit. */
export async function deliverMakeupBookingNotifications(deliveries: BookingDelivery[]) {
  // Recheck current staff access before sending student details outside the app.
  const recipients = await prisma.user.findMany({
    where: { ...recipientWhere, id: { in: deliveries.map(d => d.userId) } },
    select: { id: true, name: true, email: true },
  })
  const tasks: Promise<unknown>[] = []
  for (const delivery of deliveries) {
    const recipient = recipients.find(r => r.id === delivery.userId)
    if (!recipient) continue
    tasks.push(sendPushToUser(recipient.id, {
      title: delivery.title, body: delivery.body, url: delivery.url,
      tag: `makeup-booking:${delivery.notificationId}`, notificationId: delivery.notificationId,
    }))
    tasks.push(sendEmail({
      to: recipient.email,
      ...makeupExamBooked({ ...delivery, name: recipient.name, bookingsUrl: `${appUrl()}${delivery.url}` }),
    }))
  }
  const results = await Promise.allSettled(tasks)
  if (results.some(result => result.status === 'rejected')) console.error('[makeup-booking] external notification delivery failed')
}
