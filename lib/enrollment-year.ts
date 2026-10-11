import { ExamYearLevel, YearLevel } from '@prisma/client'

export class EnrollmentYearError extends Error {}

/** Resolve the final state together so switching attendance mode is atomic. */
export function resolveEnrollmentYear(
  current: { isAsyncStudent: boolean; yearLevel: YearLevel | null },
  updates: { isAsyncStudent?: unknown; yearLevel?: unknown },
): YearLevel | null {
  if (updates.isAsyncStudent !== undefined && typeof updates.isAsyncStudent !== 'boolean') {
    throw new EnrollmentYearError('Async status must be true or false')
  }
  const isAsync = updates.isAsyncStudent ?? current.isAsyncStudent
  const year = updates.yearLevel === undefined ? current.yearLevel : updates.yearLevel
  if (isAsync) {
    if (updates.yearLevel !== undefined && updates.yearLevel !== null) throw new EnrollmentYearError('Async students do not have a year level')
    return null
  }
  if (year !== YearLevel.YEAR_1 && year !== YearLevel.YEAR_2) {
    throw new EnrollmentYearError('Choose Year 1 or Year 2 for an in-person student')
  }
  return year
}

/** Async students study both curriculum years, without belonging to either cohort. */
export function applicableExamYears(yearLevel: YearLevel | null, isAsyncStudent: boolean, includePriorYear = false): ExamYearLevel[] {
  if (isAsyncStudent || (includePriorYear && yearLevel === YearLevel.YEAR_2)) {
    return [ExamYearLevel.YEAR_1, ExamYearLevel.YEAR_2, ExamYearLevel.BOTH]
  }
  return yearLevel ? [yearLevel, ExamYearLevel.BOTH] : []
}
