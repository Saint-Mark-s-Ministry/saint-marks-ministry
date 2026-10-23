const HONORIFIC_WORDS = new Set([
  'very',
  'rev',
  'reverend',
  'fr',
  'father',
  'mr',
  'mrs',
  'ms',
  'dr',
  'deacon',
  'dn',
])

export type PersonNameOrder = 'first' | 'last'

const nameCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

/** Prep accounts store a full name; the final word is used for last-name sorting. */
export function comparePersonNames(left: string, right: string, order: PersonNameOrder): number {
  const leftName = left.trim().replace(/\s+/g, ' ')
  const rightName = right.trim().replace(/\s+/g, ' ')
  if (order === 'last') {
    const leftLast = leftName.split(' ').pop() ?? ''
    const rightLast = rightName.split(' ').pop() ?? ''
    return nameCollator.compare(leftLast, rightLast) || nameCollator.compare(leftName, rightName)
  }
  return nameCollator.compare(leftName, rightName)
}

function normalizeNamePart(part: string): string {
  return part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, '')
}

/**
 * Build a compact avatar label from a person's first and last meaningful name.
 * Clerical and common honorifics are ignored so "Rev. Fr. Daniel Abdel-Maseih"
 * becomes "DA" instead of an unreadable string of title initials.
 */
export function getPersonInitials(name: string | null | undefined): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .map(normalizeNamePart)
    .filter(Boolean)

  const meaningfulParts = parts.filter(
    part => !HONORIFIC_WORDS.has(part.replace(/\.$/, '').toLowerCase())
  )
  const initialsFrom = meaningfulParts.length > 0 ? meaningfulParts : parts

  if (initialsFrom.length === 0) return '??'

  const firstInitial = Array.from(initialsFrom[0])[0] ?? ''
  const lastInitial = initialsFrom.length > 1
    ? Array.from(initialsFrom[initialsFrom.length - 1])[0] ?? ''
    : ''

  return `${firstInitial}${lastInitial}`.toUpperCase() || '??'
}
