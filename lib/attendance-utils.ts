import { AttendanceStatus } from "@prisma/client"

/**
 * Attendance calculation utility functions
 * Centralizes the attendance percentage logic used across the application
 *
 * Formula: (present + (late / 2)) / (total - excused) * 100
 * - 2 lates count as 1 absence
 * - Excused absences are excluded from both numerator and denominator
 * - Exam day lessons are excluded from attendance calculations (filtered before calling these functions)
 * - Cancelled lessons are excluded from attendance calculations (filtered before calling these functions)
 */

export interface AttendanceCounts {
  present: number
  late: number
  absent: number
  excused: number
}

/**
 * Calculate attendance percentage from counts
 * Returns null if there are no countable lessons (all excused or zero total)
 *
 * @param counts - Object containing present, late, absent, excused counts
 * @returns Percentage (0-100) or null if no countable lessons
 */
export function calculateAttendancePercentage(counts: AttendanceCounts): number | null {
  const { present, late, absent, excused } = counts
  const total = present + late + absent + excused
  const countableLessons = total - excused

  if (countableLessons <= 0) {
    return null
  }

  // Formula: (present + (late / 2)) / countable * 100
  // This means 2 lates = 1 absence in terms of impact
  const effectivePresent = present + (late / 2)
  return (effectivePresent / countableLessons) * 100
}

/**
 * Calculate attendance percentage from raw attendance records
 *
 * @param records - Array of attendance records with status field
 * @returns Percentage (0-100) or null if no countable lessons
 */
export function calculateAttendanceFromRecords(
  records: Array<{ status: AttendanceStatus }>
): number | null {
  const counts = countAttendanceStatuses(records)
  return calculateAttendancePercentage(counts)
}

/**
 * Count attendance statuses from an array of records
 *
 * @param records - Array of attendance records with status field
 * @returns AttendanceCounts object
 */
export function countAttendanceStatuses(
  records: Array<{ status: AttendanceStatus }>
): AttendanceCounts {
  return records.reduce(
    (acc, record) => {
      switch (record.status) {
        case AttendanceStatus.PRESENT:
          acc.present++
          break
        case AttendanceStatus.LATE:
          acc.late++
          break
        case AttendanceStatus.ABSENT:
          acc.absent++
          break
        case AttendanceStatus.EXCUSED:
          acc.excused++
          break
      }
      return acc
    },
    { present: 0, late: 0, absent: 0, excused: 0 } as AttendanceCounts
  )
}

/**
 * Check if attendance percentage meets graduation requirement (≥75%)
 *
 * @param percentage - Attendance percentage or null
 * @returns true if meets requirement, false otherwise
 */
export function meetsAttendanceRequirement(percentage: number | null): boolean {
  return percentage !== null && percentage >= 75
}

/**
 * Get attendance status label for display
 *
 * @param status - AttendanceStatus enum value
 * @returns Human-readable label
 */
export function getAttendanceStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case AttendanceStatus.PRESENT:
      return "Present"
    case AttendanceStatus.LATE:
      return "Late"
    case AttendanceStatus.ABSENT:
      return "Absent"
    case AttendanceStatus.EXCUSED:
      return "Excused"
    default:
      return "Unknown"
  }
}

/**
 * Calculate the "effective absences" from counts
 * This is useful for displaying how many absences a student effectively has
 *
 * Formula: absent + (late / 2)
 *
 * @param counts - AttendanceCounts object
 * @returns Number of effective absences
 */
export function calculateEffectiveAbsences(counts: AttendanceCounts): number {
  return counts.absent + (counts.late / 2)
}

/**
 * Calculate how many more absences a student can have before falling below 75%
 *
 * @param counts - Current attendance counts
 * @param remainingLessons - Number of lessons remaining in the year
 * @returns Number of absences allowed (can be negative if already below threshold)
 */
export function calculateAbsencesAllowed(
  counts: AttendanceCounts,
  remainingLessons: number
): number {
  const { present, late, absent, excused } = counts
  const currentTotal = present + late + absent + excused

  // To maintain 75%: effectivePresent / countable >= 0.75
  // effectivePresent + remainingLessons >= 0.75 * (countable + remainingLessons)
  // Solving for allowed absences...
  const currentEffectivePresent = present + (late / 2)
  const currentCountable = currentTotal - excused

  // Assuming student attends all remaining lessons:
  // (currentEffectivePresent + remainingLessons) / (currentCountable + remainingLessons) = 0.75
  // We want: how many of those remaining can they miss?

  const futurePresentNeeded = 0.75 * (currentCountable + remainingLessons)
  const absencesAllowed = currentEffectivePresent + remainingLessons - futurePresentNeeded

  return Math.floor(absencesAllowed)
}

/**
 * Graduation needs evidence: the per-requirement "met" flags read true while a
 * student has no attendance or exam data yet (on track, not penalized), but a
 * student with nothing recorded is not eligible to graduate.
 */
export function isGraduationEligible(input: {
  attendancePercentage: number | null
  examAverage: number | null
  requirementsMet: boolean[]
}): boolean {
  return input.attendancePercentage !== null && input.examAverage !== null && input.requirementsMet.every(Boolean)
}

/** Current async students are assessed solely on rotations, including legacy records and slips. */
export function excludeAsyncLessonRecords(
  enrollments: Array<{ studentId: string; isAsyncStudent?: boolean | null }>,
) {
  const studentIds = enrollments.filter(e => e.isAsyncStudent).map(e => e.studentId)
  return studentIds.length ? { NOT: { studentId: { in: studentIds } } } : {}
}
