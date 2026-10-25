import type { YearLevel } from '@prisma/client'

/** Async attendance alone does not create a Year 2 renewal requirement. */
export function requiresAnnualMentorUpdate(
  enrollment: { isActive: boolean; yearLevel: YearLevel | null } | null | undefined
): boolean {
  return Boolean(enrollment?.isActive && enrollment.yearLevel === 'YEAR_2')
}
