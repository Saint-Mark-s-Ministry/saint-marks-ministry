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

export interface ConfessionPeriodView {
  start: string
  end: string // exclusive
  status: ConfessionPeriodStatus
  uploadedAt: string | null
}

/**
 * One student's confession status for every period of an academic year, matched
 * the way the admin tracker matches them: a slip belongs to a period when its
 * periodStart equals the period's start. Returns ISO strings so it can be sent
 * as JSON as-is; never includes the slip's image URL.
 */
export function buildConfessionPeriodViews(
  year: { startDate: Date | string; endDate: Date | string },
  enrollment: {
    attendanceStartDate?: Date | string | null
    academicYear?: { startDate: Date | string } | null
    enrolledAt: Date | string
  },
  slips: { periodStart: Date | null; createdAt: Date }[],
  now: Date = new Date()
): ConfessionPeriodView[] {
  const studentStart = getStudentStart(enrollment)
  return getConfessionPeriods(year).map(period => {
    const slip = slips.find(s => s.periodStart?.getTime() === period.start.getTime())
    return {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      status: getConfessionPeriodStatus(period, studentStart, !!slip, now),
      uploadedAt: slip ? slip.createdAt.toISOString() : null,
    }
  })
}

export function formatConfessionPeriod(period: ConfessionPeriod): string {
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const last = new Date(period.end.getTime() - 1)
  return `${month(period.start)}–${month(last)} ${last.getUTCFullYear()}`
}
