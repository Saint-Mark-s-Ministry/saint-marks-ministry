export type MentorContact = {
  name: string
  email: string | null
  phone: string | null
}

export type SubmittedMentor = {
  mentorName: string | null
  mentorEmail?: string | null
  mentorPhone: string | null
}

export type MentorEnrollment = SubmittedMentor & {
  mentor: { name: string; email?: string | null; phone?: string | null } | null
}

/** Choose an entire contact record so a new name never inherits an old email or phone. */
export function resolveMentorContact(
  enrollment: MentorEnrollment,
  submitted: SubmittedMentor | null
): MentorContact | null {
  if (submitted?.mentorName) {
    return { name: submitted.mentorName, email: submitted.mentorEmail ?? null, phone: submitted.mentorPhone }
  }
  if (enrollment.mentorName && enrollment.mentorName !== enrollment.mentor?.name) {
    return { name: enrollment.mentorName, email: null, phone: enrollment.mentorPhone }
  }
  if (enrollment.mentor) {
    return { name: enrollment.mentor.name, email: enrollment.mentor.email ?? null, phone: enrollment.mentor.phone ?? null }
  }
  return null
}
