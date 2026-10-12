/**
 * Input rules for a parent registering a child (Sunday School). Pure, so the
 * rules are unit-testable and the route only wires them up.
 *
 * The mobile app mirrors these in apps/mobile/src/data/parent-children.ts.
 * Keep the two in step.
 */

import { RegistrationStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const EARLIEST_BIRTH_YEAR = 1950

/**
 * A calendar date in YYYY-MM-DD form. Rejects impossible days such as Feb 31,
 * which `new Date()` would silently roll over into March. Rejects dates in the
 * future and before EARLIEST_BIRTH_YEAR. Returns a UTC-midnight Date, or null.
 */
export function parseBirthDate(value: unknown, now: Date = new Date()): Date | null {
  if (typeof value !== 'string') return null
  const match = DATE_PATTERN.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < EARLIEST_BIRTH_YEAR) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC rolls Feb 31 into March; checking the parts back catches that.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  if (date.getTime() > today) return null
  return date
}

/**
 * Guardian phone, normalized to digits with an optional leading +. Spaces,
 * dashes, dots, and brackets are removed. Anything else, or a length outside
 * 7-15 digits, is rejected.
 */
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[\s\-.()]/g, '').replace(/^\+/, '')
  if (!/^\d{7,15}$/.test(digits)) return null
  return `${hasPlus ? '+' : ''}${digits}`
}

/** Case-insensitive name match, so "anna" and "Anna " count as the same child. */
export function sameChildName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Whether this parent already has this child, looked up only among their own
 * linked children and their own pending requests. Another family's children are
 * never searched, so a duplicate check can't reveal them.
 */
export async function findOwnDuplicate(
  parentId: string,
  firstName: string,
  lastName: string,
  birthDate: Date,
): Promise<'linked' | 'pending' | null> {
  const first = { equals: firstName.trim(), mode: 'insensitive' as const }
  const last = { equals: lastName.trim(), mode: 'insensitive' as const }
  const linked = await prisma.sundaySchoolChildGuardian.findFirst({
    where: { parentId, endedAt: null, child: { firstName: first, lastName: last, birthDate } },
    select: { id: true },
  })
  if (linked) return 'linked'
  const pending = await prisma.childRegistrationRequest.findFirst({
    where: { submittedByUserId: parentId, status: RegistrationStatus.PENDING, firstName: first, lastName: last, birthDate },
    select: { id: true },
  })
  return pending ? 'pending' : null
}
