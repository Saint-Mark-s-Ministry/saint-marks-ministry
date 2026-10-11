import { createHash, randomBytes } from 'node:crypto'

/**
 * Server-only half of the roster sign-up link helpers. Kept apart from
 * lib/sunday-school-roster-link.ts so the servant-facing dialog can import the
 * shared constants and the state predicate without pulling node:crypto into the
 * browser bundle.
 */

/** 256 bits of entropy, URL-safe — unguessable, so the public route needs no lockout. */
export function createRosterLinkToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashRosterLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
