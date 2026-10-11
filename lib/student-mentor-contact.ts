import { prisma } from '@/lib/prisma'

type MentorContact = {
  name: string
  email: string | null
  phone: string | null
}

/** Contact details are separate from the account assignment that grants mentor access. */
export async function getStudentMentorContact(
  studentId: string,
  enrollment: {
    mentorName: string | null
    mentorPhone: string | null
    mentor: MentorContact | null
  }
): Promise<MentorContact | null> {
  const confirmed = await prisma.annualMentorInformation.findFirst({
    where: { studentId, academicYear: { isActive: true } },
    orderBy: { submittedAt: 'desc' },
    select: { mentorName: true, mentorEmail: true, mentorPhone: true },
  })

  if (confirmed) {
    return {
      name: confirmed.mentorName,
      email: confirmed.mentorEmail,
      phone: confirmed.mentorPhone,
    }
  }

  if (enrollment.mentor) return enrollment.mentor
  if (enrollment.mentorName) {
    return { name: enrollment.mentorName, phone: enrollment.mentorPhone, email: null }
  }
  return null
}
