/** Capitalize initials without changing intentional casing such as McDonald. */
function normalizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ').replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase())
}

/** Keep accepting fullName from older forms while requiring both new fields. */
export function getRegistrationName(fields: {
  firstName?: unknown
  lastName?: unknown
  fullName?: unknown
}): string {
  if (fields.firstName !== undefined || fields.lastName !== undefined) {
    const firstName = normalizeName(fields.firstName)
    const lastName = normalizeName(fields.lastName)
    return firstName && lastName ? `${firstName} ${lastName}` : ''
  }
  return normalizeName(fields.fullName)
}
