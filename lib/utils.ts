import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date string as UTC to avoid timezone shifts.
 * Use this for dates that represent a specific calendar day (not a moment in time).
 * This prevents dates stored as midnight UTC from appearing as the previous day
 * when displayed in timezones west of UTC (like EST/PST).
 */
export function formatDateUTC(dateStr: string | Date, options?: Intl.DateTimeFormatOptions) {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }
  // Always force UTC timezone to prevent server/client hydration mismatches
  // and ensure consistent date display regardless of where the code runs
  return date.toLocaleDateString('en-US', { ...defaultOptions, ...options, timeZone: 'UTC' })
}

/** Like formatDateUTC, but uses exactly the options given (for date parts: `{ month: 'short' }`). */
export function formatUTC(dateStr: string | Date, options: Intl.DateTimeFormatOptions) {
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
  return date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}

/**
 * Format a timestamp for toast notification descriptions.
 * Produces output like: "Jun 15, 2024, 2:30 PM"
 */
export function formatToastTimestamp(date: Date = new Date()): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Options for a select that must still show the current value when the option
 * list doesn't include it (e.g. an inactive father of confession, or a mentor
 * the viewer's role can't list), instead of falling back to "Unassigned".
 */
export function withCurrentOption<T extends { id: string; name: string }>(
  options: T[],
  current?: { id: string; name: string } | null
): { id: string; name: string }[] {
  return current && !options.some(o => o.id === current.id) ? [current, ...options] : options
}

/**
 * Build a deduplicated student array from enrollment data.
 * Groups multiple enrollments under the same student.
 */
export interface EnrollmentForStudentMap {
  isActive: boolean
  student: { id: string; name: string; [key: string]: unknown }
  yearLevel: string
  isAsyncStudent?: boolean
  asyncApprovedAt?: string | Date | null
  mentor?: { id: string; [key: string]: unknown } | null
}

export interface StudentWithEnrollments {
  id: string
  name: string
  enrollments: Array<{ yearLevel: string; mentorId?: string; isAsyncStudent?: boolean; asyncApprovedAt?: string | Date | null }>
  [key: string]: unknown
}

export function buildStudentMapFromEnrollments(
  enrollmentsData: EnrollmentForStudentMap[]
): StudentWithEnrollments[] {
  const studentMap = new Map<string, StudentWithEnrollments>()
  if (Array.isArray(enrollmentsData)) {
    for (const enrollment of enrollmentsData) {
      if (enrollment.isActive) {
        const student = enrollment.student
        if (!studentMap.has(student.id)) {
          studentMap.set(student.id, {
            ...student,
            enrollments: []
          })
        }
        studentMap.get(student.id)!.enrollments.push({
          yearLevel: enrollment.yearLevel,
          mentorId: enrollment.mentor?.id,
          isAsyncStudent: enrollment.isAsyncStudent,
          asyncApprovedAt: enrollment.asyncApprovedAt,
        })
      }
    }
  }
  return Array.from(studentMap.values())
}
