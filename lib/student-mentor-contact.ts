import { RegistrationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { resolveMentorContact, type MentorEnrollment, type SubmittedMentor } from '@/lib/mentor-contact'

/** Batch the contact lookup for rosters; never perform one query per student. */
export async function getSubmittedMentorContacts(studentIds: string[]) {
  const contacts = new Map<string, SubmittedMentor>()
  if (studentIds.length === 0) return contacts
  const [annual, applications] = await Promise.all([
    prisma.annualMentorInformation.findMany({
      where: { studentId: { in: studentIds }, academicYear: { isActive: true } },
      orderBy: { submittedAt: 'desc' },
      select: { studentId: true, mentorName: true, mentorEmail: true, mentorPhone: true },
    }),
    prisma.registrationSubmission.findMany({
      where: { createdUserId: { in: studentIds }, status: RegistrationStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
      select: { createdUserId: true, mentorName: true, mentorEmail: true, mentorPhone: true },
    }),
  ])
  // The approved application also retains the latest confirmed mentor across year rollover.
  for (const entry of applications) {
    if (entry.createdUserId && entry.mentorName && !contacts.has(entry.createdUserId)) {
      contacts.set(entry.createdUserId, entry)
    }
  }
  const confirmed = new Set<string>()
  for (const entry of annual) {
    if (!confirmed.has(entry.studentId)) {
      contacts.set(entry.studentId, entry)
      confirmed.add(entry.studentId)
    }
  }
  return contacts
}

export async function getStudentMentorContact(studentId: string, enrollment: MentorEnrollment) {
  const contacts = await getSubmittedMentorContacts([studentId])
  return resolveMentorContact(enrollment, contacts.get(studentId) ?? null)
}

export async function withEnrollmentMentorContacts<T extends MentorEnrollment & { studentId: string }>(enrollments: T[]) {
  const contacts = await getSubmittedMentorContacts(enrollments.map(e => e.studentId))
  return enrollments.map(e => ({ ...e, mentorContact: resolveMentorContact(e, contacts.get(e.studentId) ?? null) }))
}

export async function withUserMentorContacts<T extends { id: string; enrollments?: MentorEnrollment[] }>(users: T[]) {
  const students = users.filter(user => user.enrollments?.length)
  const contacts = await getSubmittedMentorContacts(students.map(user => user.id))
  return users.map(user => ({
    ...user,
    enrollments: user.enrollments?.map(e => ({
      ...e, mentorContact: resolveMentorContact(e, contacts.get(user.id) ?? null),
    })),
  }))
}
