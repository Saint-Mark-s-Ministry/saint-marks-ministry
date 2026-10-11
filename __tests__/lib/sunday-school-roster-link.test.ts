import { describe, expect, it } from 'vitest'
import {
  isRosterLinkTokenShaped,
  resolveRosterLinkExpiry,
  resolveRosterLinkMaxUses,
  rosterLinkState,
  ROSTER_LINK_DEFAULT_HOURS,
  ROSTER_LINK_DEFAULT_MAX_USES,
  ROSTER_LINK_MAX_HOURS,
  ROSTER_LINK_MAX_USES,
} from '@/lib/sunday-school-roster-link'
import {
  createRosterLinkToken,
  hashRosterLinkToken,
} from '@/lib/sunday-school-roster-link-token'

const now = new Date('2026-09-28T12:00:00.000Z')

function link(overrides: Partial<{
  expiresAt: Date
  maxUses: number
  useCount: number
  revokedAt: Date | null
}> = {}) {
  return {
    expiresAt: new Date('2026-09-28T20:00:00.000Z'),
    maxUses: 40,
    useCount: 0,
    revokedAt: null,
    ...overrides,
  }
}

describe('roster sign-up link tokens', () => {
  it('mints unguessable URL-safe tokens that are only ever stored as a hash', () => {
    const token = createRosterLinkToken()

    expect(isRosterLinkTokenShaped(token)).toBe(true)
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    // 32 random bytes as base64url
    expect(token.length).toBe(43)
    expect(createRosterLinkToken()).not.toBe(token)

    const hash = hashRosterLinkToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    expect(hashRosterLinkToken(token)).toBe(hash)
  })

  it('rejects anything that cannot be a token before it reaches the database', () => {
    expect(isRosterLinkTokenShaped('short')).toBe(false)
    expect(isRosterLinkTokenShaped('a'.repeat(65))).toBe(false)
    expect(isRosterLinkTokenShaped('has spaces in it and is long enough to pass')).toBe(false)
    expect(isRosterLinkTokenShaped("' OR 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false)
    expect(isRosterLinkTokenShaped(null)).toBe(false)
    expect(isRosterLinkTokenShaped(undefined)).toBe(false)
    expect(isRosterLinkTokenShaped(12345)).toBe(false)
    expect(isRosterLinkTokenShaped({})).toBe(false)
  })
})

describe('rosterLinkState', () => {
  it('is active only while every bound still holds', () => {
    expect(rosterLinkState(link(), now)).toBe('ACTIVE')
  })

  it('reports a revoked link even when it has not expired and has uses left', () => {
    expect(rosterLinkState(link({ revokedAt: new Date('2026-09-28T11:00:00.000Z') }), now))
      .toBe('REVOKED')
  })

  it('expires exactly at expiresAt rather than after it', () => {
    expect(rosterLinkState(link({ expiresAt: now }), now)).toBe('EXPIRED')
    expect(rosterLinkState(link({ expiresAt: new Date(now.getTime() + 1) }), now)).toBe('ACTIVE')
  })

  it('is exhausted once the cap is reached, and cannot go past it', () => {
    expect(rosterLinkState(link({ maxUses: 2, useCount: 1 }), now)).toBe('ACTIVE')
    expect(rosterLinkState(link({ maxUses: 2, useCount: 2 }), now)).toBe('EXHAUSTED')
    expect(rosterLinkState(link({ maxUses: 2, useCount: 5 }), now)).toBe('EXHAUSTED')
  })

  it('treats revocation as final even for an exhausted, expired link', () => {
    const dead = link({
      revokedAt: new Date('2026-09-01T00:00:00.000Z'),
      expiresAt: new Date('2026-09-02T00:00:00.000Z'),
      useCount: 99,
    })
    expect(rosterLinkState(dead, now)).toBe('REVOKED')
  })

  it('accepts serialized dates, as an API response carries them', () => {
    expect(rosterLinkState({
      expiresAt: '2026-09-28T20:00:00.000Z',
      maxUses: 40,
      useCount: 0,
      revokedAt: null,
    }, now)).toBe('ACTIVE')
  })
})

describe('resolveRosterLinkExpiry', () => {
  it('defaults to the standard window', () => {
    expect(resolveRosterLinkExpiry(undefined, now)).toEqual(
      new Date(now.getTime() + ROSTER_LINK_DEFAULT_HOURS * 3600_000)
    )
    expect(resolveRosterLinkExpiry(null, now)).not.toBeNull()
  })

  it('allows the boundary and refuses anything past it', () => {
    expect(resolveRosterLinkExpiry(ROSTER_LINK_MAX_HOURS, now)).toEqual(
      new Date(now.getTime() + ROSTER_LINK_MAX_HOURS * 3600_000)
    )
    expect(resolveRosterLinkExpiry(ROSTER_LINK_MAX_HOURS + 1, now)).toBeNull()
  })

  it('refuses a lifetime that would create an already-dead or endless link', () => {
    expect(resolveRosterLinkExpiry(0, now)).toBeNull()
    expect(resolveRosterLinkExpiry(-5, now)).toBeNull()
    expect(resolveRosterLinkExpiry(Infinity, now)).toBeNull()
    expect(resolveRosterLinkExpiry(NaN, now)).toBeNull()
    expect(resolveRosterLinkExpiry('not a number', now)).toBeNull()
  })
})

describe('resolveRosterLinkMaxUses', () => {
  it('defaults, allows both boundaries, and coerces a numeric JSON string', () => {
    expect(resolveRosterLinkMaxUses(undefined)).toBe(ROSTER_LINK_DEFAULT_MAX_USES)
    expect(resolveRosterLinkMaxUses(1)).toBe(1)
    expect(resolveRosterLinkMaxUses(ROSTER_LINK_MAX_USES)).toBe(ROSTER_LINK_MAX_USES)
    expect(resolveRosterLinkMaxUses('40')).toBe(40)
  })

  it('refuses a cap that would make the link unbounded or unusable', () => {
    expect(resolveRosterLinkMaxUses(0)).toBeNull()
    expect(resolveRosterLinkMaxUses(-1)).toBeNull()
    expect(resolveRosterLinkMaxUses(ROSTER_LINK_MAX_USES + 1)).toBeNull()
    expect(resolveRosterLinkMaxUses(1.5)).toBeNull()
    expect(resolveRosterLinkMaxUses('lots')).toBeNull()
  })
})
