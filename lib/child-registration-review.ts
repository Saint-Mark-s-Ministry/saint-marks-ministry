/**
 * Pure helpers for the child-registration review queue. Kept separate from
 * the route so the masking/duplicate rules are unit-testable without a
 * database.
 *
 * The mobile app mirrors the display-facing pieces in
 * apps/mobile/src/data/sunday-school-child-registrations.ts. Keep the two in
 * step.
 */

import { prisma } from '@/lib/prisma'
import { RegistrationStatus, SundaySchoolLevel } from '@prisma/client'

/**
 * Guardian phone, masked to its last 4 digits for a summary/list view. Full
 * phone is only ever returned from a request's own detail/review payload.
 * `normalizePhone` already guarantees 7-15 digits with an optional leading
 * `+`, so this always has at least 4 digits to show.
 */
export function maskGuardianPhone(phone: string): string {
  const digits = phone.replace(/^\+/, '')
  const last4 = digits.slice(-4)
  return `•••• ${last4}`
}

export type DuplicateMatch = {
  type: 'existing_child' | 'pending_request'
  id: string
  firstName: string
  lastName: string
  className: string | null
}

export type DuplicateSignal = {
  matchCount: number
  matches: DuplicateMatch[]
}

/**
 * Safe duplicate matching: same first+last name (case-insensitive) and the
 * same birth date. Scoped to the request's own intended level — the same
 * boundary the list route already enforces for a non-admin reviewer, so this
 * never surfaces a child or request outside what that reviewer could already
 * see elsewhere (the roster, the queue itself). A cross-level duplicate is
 * only ever caught by an admin, who already sees every level.
 *
 * Never returns guardian contact info for the matched side — a name and
 * class are the only facts a reviewer needs to recognize "this looks like
 * the same child," and both are already visible to them through other
 * screens at this level.
 */
export async function findRegistrationDuplicates(request: {
  id: string
  firstName: string
  lastName: string
  birthDate: Date
  intendedLevel: SundaySchoolLevel
}): Promise<DuplicateSignal> {
  const first = { equals: request.firstName.trim(), mode: 'insensitive' as const }
  const last = { equals: request.lastName.trim(), mode: 'insensitive' as const }

  const [children, pendingRequests] = await Promise.all([
    prisma.sundaySchoolChild.findMany({
      where: {
        isActive: true,
        level: request.intendedLevel,
        firstName: first,
        lastName: last,
        birthDate: request.birthDate,
      },
      select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
      take: 5,
    }),
    prisma.childRegistrationRequest.findMany({
      where: {
        id: { not: request.id },
        status: { in: [RegistrationStatus.PENDING, RegistrationStatus.CHANGES_REQUESTED] },
        intendedLevel: request.intendedLevel,
        firstName: first,
        lastName: last,
        birthDate: request.birthDate,
      },
      select: { id: true, firstName: true, lastName: true },
      take: 5,
    }),
  ])

  const matches: DuplicateMatch[] = [
    ...children.map((c) => ({
      type: 'existing_child' as const,
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      className: c.class?.name ?? null,
    })),
    ...pendingRequests.map((r) => ({
      type: 'pending_request' as const,
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      className: null,
    })),
  ]

  return { matchCount: matches.length, matches }
}
