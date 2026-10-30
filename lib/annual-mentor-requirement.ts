import type { EnrollmentStatus, YearLevel } from '@prisma/client'

/** Withdrawn Year 2 students may finish renewal before staff reactivate them. */
export function requiresAnnualMentorUpdate(
  enrollment: { isActive?: boolean; status?: EnrollmentStatus; yearLevel?: YearLevel | null } | null | undefined
): boolean {
  return Boolean(enrollment?.yearLevel === 'YEAR_2' && (
    enrollment.status === 'WITHDRAWN' ||
    (enrollment.isActive && enrollment.status !== 'GRADUATED')
  ))
}
