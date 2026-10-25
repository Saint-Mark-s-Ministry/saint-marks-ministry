import { RegistrationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveMentorContact, type MentorEnrollment, type SubmittedMentor, type MentorFormState } from '@/lib/mentor-contact'

type ContactSubmission = SubmittedMentor & (
  { source: 'application' } |
  { source: 'annual'; updatedAt: Date; submittedAt: Date; reviewedAt: Date | null }
)

function mentorFormState(enrollment: MentorEnrollment, submitted: ContactSubmission | undefined): MentorFormState | null {
  if (enrollment.yearLevel !== 'YEAR_2' || enrollment.isActive === false) return null
  if (submitted?.source !== 'annual') return { status: 'REQUIRED', submission: null }
  return {
    status: submitted.reviewedAt ? 'REVIEWED' : 'PENDING_REVIEW',
    submission: {
      name: submitted.mentorName ?? '', email: submitted.mentorEmail ?? null, phone: submitted.mentorPhone,
      updatedAt: submitted.updatedAt.toISOString(), submittedAt: submitted.submittedAt.toISOString(),
    },
  }
}

function withMentorState<T extends MentorEnrollment>(enrollment: T, submitted: ContactSubmission | undefined) {
  const mentorForm = mentorFormState(enrollment, submitted)
  const { mentor, mentorId, mentorName, mentorPhone, ...rest } = enrollment
  const required = mentorForm?.status === 'REQUIRED'
  return {
    ...rest,
    // Stale legacy assignments must not be presented as current-year mentors.
    mentor: required ? null : mentor,
    ...(mentorId !== undefined ? { mentorId: required ? null : mentorId } : {}),
    mentorName: required ? null : mentorName,
    mentorPhone: required ? null : mentorPhone,
    mentorContact: currentMentorContact(enrollment, submitted),
    mentorForm,
  }
}

function currentMentorContact(enrollment: MentorEnrollment, submitted: ContactSubmission | undefined) {
  // A Year 1 application and the previous assigned account cannot stand in for
  // the fresh confirmation required after promotion.
  if (enrollment.yearLevel === 'YEAR_2' && enrollment.isActive !== false) {
    return submitted?.source === 'annual' && submitted.mentorName
      ? { name: submitted.mentorName, email: submitted.mentorEmail ?? null, phone: submitted.mentorPhone }
      : null
  }
  return resolveMentorContact(enrollment, submitted ?? null)
}

/** Batch the contact lookup for rosters; never perform one query per student. */
export async function getSubmittedMentorContacts(studentIds: string[]) {
  const contacts = new Map<string, ContactSubmission>()
  if (studentIds.length === 0) return contacts
  const [annual, applications] = await Promise.all([
    prisma.annualMentorInformation.findMany({
      where: { studentId: { in: studentIds }, academicYear: { isActive: true } },
      orderBy: { submittedAt: 'desc' },
      select: { studentId: true, mentorName: true, mentorEmail: true, mentorPhone: true, submittedAt: true, updatedAt: true, reviewedAt: true },
    }),
    prisma.registrationSubmission.findMany({
      where: { createdUserId: { in: studentIds }, status: RegistrationStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
      select: { createdUserId: true, mentorName: true, mentorEmail: true, mentorPhone: true },
    }),
  ])
  // Year 1 and historical views can use the approved application. Active Year 2
  // students require their current-year confirmation instead.
  for (const entry of applications) {
    if (entry.createdUserId && entry.mentorName && !contacts.has(entry.createdUserId)) {
      contacts.set(entry.createdUserId, { ...entry, source: 'application' })
    }
  }
  const confirmed = new Set<string>()
  for (const entry of annual) {
    if (!confirmed.has(entry.studentId)) {
      contacts.set(entry.studentId, { ...entry, source: 'annual' })
      confirmed.add(entry.studentId)
    }
  }
  return contacts
}

export async function getStudentMentorContact(studentId: string, enrollment: MentorEnrollment) {
  const contacts = await getSubmittedMentorContacts([studentId])
  return currentMentorContact(enrollment, contacts.get(studentId))
}

export async function withEnrollmentMentorContacts<T extends MentorEnrollment & { studentId: string }>(enrollments: T[]) {
  const contacts = await getSubmittedMentorContacts(enrollments.map(e => e.studentId))
  return enrollments.map(e => withMentorState(e, contacts.get(e.studentId)))
}

export async function withUserMentorContacts<T extends { id: string; enrollments?: MentorEnrollment[] }>(users: T[]) {
  const students = users.filter(user => user.enrollments?.length)
  const contacts = await getSubmittedMentorContacts(students.map(user => user.id))
  return users.map(user => ({
    ...user,
    enrollments: user.enrollments?.map(e => withMentorState(e, contacts.get(user.id))),
  }))
}
