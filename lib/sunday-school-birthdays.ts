/**
 * Birthday helpers for the Sunday School birthday list. Birth dates are
 * calendar values stored at midnight UTC, so every read uses UTC parts. A
 * device time zone must never shift the displayed day.
 *
 * The mobile app mirrors these in apps/mobile/src/data/sunday-school-birthdays.ts.
 * Keep the two in step.
 */

export interface BirthdayParts {
  year: number
  month: number
  day: number
}

export function getBirthdayParts(value: string | Date): BirthdayParts | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** The age a child turns in `year`. Never negative. */
export function ageOnBirthdayInYear(value: string | Date, year: number): number | null {
  const parts = getBirthdayParts(value)
  if (!parts) return null
  return Math.max(0, year - parts.year)
}

/** Whether the birthday falls on today's calendar day, judged in UTC like the stored value. */
export function isBirthdayToday(value: string | Date, now: Date = new Date()): boolean {
  const parts = getBirthdayParts(value)
  if (!parts) return false
  return parts.month === now.getUTCMonth() + 1 && parts.day === now.getUTCDate()
}
