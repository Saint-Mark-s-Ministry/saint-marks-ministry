/**
 * Sunday School mode: temporary, class-scoped roster sign-up links (QR codes).
 *
 * A servant of a class mints a link, prints or projects the QR, and families
 * fill in their own details. The link's row carries the class, the Sunday
 * School year, and therefore the grade level — the public request supplies
 * only the child's own details, never a destination. That is what keeps a link
 * incapable of adding a child to any roster but the one it was created for.
 *
 * The token is never stored. Only its SHA-256 lives in the database, the same
 * way a password reset token would, so a leaked dump yields no usable link.
 *
 * Everything here is pure and browser-safe; token minting and hashing live in
 * lib/sunday-school-roster-link-token.ts because they need node:crypto.
 */

/** 8 hours: long enough for one Sunday, short enough that a photo of the QR goes stale. */
export const ROSTER_LINK_DEFAULT_HOURS = 8
/** A week. Anything longer should be a fresh link, not a standing one. */
export const ROSTER_LINK_MAX_HOURS = 24 * 7
export const ROSTER_LINK_DEFAULT_MAX_USES = 40
export const ROSTER_LINK_MAX_USES = 200
export const ROSTER_LINK_MAX_LABEL_LENGTH = 80

export type RosterLinkState = 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED'

/**
 * Tokens are only ever looked up by hash, so anything that cannot be a
 * base64url token is rejected before it reaches the database.
 */
export function isRosterLinkTokenShaped(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(value)
}

export function rosterLinkState(
  link: { expiresAt: Date | string; maxUses: number; useCount: number; revokedAt: Date | string | null },
  now: Date = new Date()
): RosterLinkState {
  if (link.revokedAt) return 'REVOKED'
  if (new Date(link.expiresAt).getTime() <= now.getTime()) return 'EXPIRED'
  if (link.useCount >= link.maxUses) return 'EXHAUSTED'
  return 'ACTIVE'
}

/** Clamp a requested lifetime to the allowed window, defaulting when absent. */
export function resolveRosterLinkExpiry(expiresInHours: unknown, now: Date = new Date()): Date | null {
  const hours = expiresInHours === undefined || expiresInHours === null
    ? ROSTER_LINK_DEFAULT_HOURS
    : Number(expiresInHours)

  if (!Number.isFinite(hours) || hours <= 0 || hours > ROSTER_LINK_MAX_HOURS) return null
  return new Date(now.getTime() + hours * 60 * 60 * 1000)
}

export function resolveRosterLinkMaxUses(maxUses: unknown): number | null {
  const uses = maxUses === undefined || maxUses === null
    ? ROSTER_LINK_DEFAULT_MAX_USES
    : Number(maxUses)

  if (!Number.isInteger(uses) || uses < 1 || uses > ROSTER_LINK_MAX_USES) return null
  return uses
}
