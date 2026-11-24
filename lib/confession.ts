/**
 * Confession tracking: every student must confess at least once per 2-month
 * period, proven by a father-of-confession slip a servant uploads.
 *
 * Periods run in 2-month batches from the first of the academic year's start
 * month (e.g. Sep–Oct, Nov–Dec, …). The period a student joins in is covered
 * by their registration, since their priest signs the registration form.
 */

export type ConfessionPeriodStatus =
  | 'na'           // before the student joined
  | 'registration' // covered by the registration form
  | 'slip'         // slip uploaded
  | 'missing'      // period ended with no slip
  | 'due'          // current period, no slip yet
  | 'upcoming'     // period hasn't started

export interface ConfessionPeriod {
  start: Date
  end: Date // exclusive
}

export function getConfessionPeriods(year: { startDate: Date | string; endDate: Date | string }): ConfessionPeriod[] {
  const first = new Date(year.startDate)
  const end = new Date(year.endDate)
  const periods: ConfessionPeriod[] = []
  for (let m = first.getUTCMonth(); ; m += 2) {
    const start = new Date(Date.UTC(first.getUTCFullYear(), m, 1))
    if (!(start < end)) break // also stops on invalid dates
    periods.push({ start, end: new Date(Date.UTC(first.getUTCFullYear(), m + 2, 1)) })
  }
  return periods
}

/**
 * When a student's program started: their late-start date, else their academic
 * year's start, else when they were enrolled. enrolledAt isn't preferred because
 * most existing accounts were bulk-created months after their year began; students
 * who join mid-year get a late-start date (attendance needs it too).
 */
export function getStudentStart(enrollment: {
  attendanceStartDate?: Date | string | null
  academicYear?: { startDate: Date | string } | null
  enrolledAt: Date | string
}): Date {
  return new Date(enrollment.attendanceStartDate ?? enrollment.academicYear?.startDate ?? enrollment.enrolledAt)
}

export function getConfessionPeriodStatus(
  period: ConfessionPeriod,
  studentStart: Date,
  hasSlip: boolean,
  now: Date = new Date()
): ConfessionPeriodStatus {
  if (hasSlip) return 'slip'
  if (period.end <= studentStart) return 'na'
  if (period.start <= studentStart) return 'registration'
  if (period.start > now) return 'upcoming'
  return period.end <= now ? 'missing' : 'due'
}

export function formatConfessionPeriod(period: ConfessionPeriod): string {
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const last = new Date(period.end.getTime() - 1)
  return `${month(period.start)}–${month(last)} ${last.getUTCFullYear()}`
}

/**
 * The blank confession slip students print and take to their father of
 * confession. A read-only preview of the ministry's Google Doc, so students can
 * view and print it but never land in its editor.
 */
export const CONFESSION_SLIP_TEMPLATE_URL =
  'https://docs.google.com/document/d/1yZ5PaSArl0-4juGydc8M1D5LshmQkFImd3rMpPmBKw0/preview'

/**
 * Whether a student may upload their own slip for a period, judged by the
 * period's status *ignoring* any slip already on file: only a period that is
 * open now or already ended. The registration-covered period, periods before
 * they joined, and future periods need no slip. Replacing an existing slip is
 * decided separately (students may only replace their own uploads).
 */
export function canStudentUploadConfessionSlip(statusWithoutSlip: ConfessionPeriodStatus): boolean {
  return statusWithoutSlip === 'due' || statusWithoutSlip === 'missing'
}
