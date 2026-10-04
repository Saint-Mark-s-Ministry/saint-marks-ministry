export const BIRTHDAY_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export interface BirthdayParts {
  year: number
  month: number
  day: number
}

/** Birth dates are calendar values stored at midnight UTC; always read their UTC parts. */
export function getBirthdayParts(value: string | Date): BirthdayParts | null {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  }
}

export function formatBirthday(value: string | Date): string {
  const parts = getBirthdayParts(value)
  if (!parts) return 'Unknown birthday'
  return `${BIRTHDAY_MONTHS[parts.month - 1]} ${parts.day}`
}

export function ageOnBirthdayInYear(value: string | Date, year: number): number | null {
  const parts = getBirthdayParts(value)
  if (!parts) return null
  return Math.max(0, year - parts.year)
}

export function compareBirthdays(
  left: { birthDate: string | Date | null; firstName: string; lastName: string },
  right: { birthDate: string | Date | null; firstName: string; lastName: string }
): number {
  const leftParts = left.birthDate ? getBirthdayParts(left.birthDate) : null
  const rightParts = right.birthDate ? getBirthdayParts(right.birthDate) : null
  if (!leftParts && !rightParts) return 0
  if (!leftParts) return 1
  if (!rightParts) return -1

  return (
    leftParts.month - rightParts.month ||
    leftParts.day - rightParts.day ||
    left.firstName.localeCompare(right.firstName) ||
    left.lastName.localeCompare(right.lastName)
  )
}
