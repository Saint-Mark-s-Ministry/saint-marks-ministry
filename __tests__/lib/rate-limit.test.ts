import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn(), deleteMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: mocks.queryRaw, rateLimitBucket: { deleteMany: mocks.deleteMany } },
}))

import { checkLoginRateLimit, checkRateLimit, resetLoginRateLimit } from '@/lib/rate-limit'

const inSeconds = (s: number) => new Date(Date.now() + s * 1000)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteMany.mockResolvedValue({ count: 0 })
})

describe('shared rate limiter', () => {
  it('allows up to the limit using the database count', async () => {
    mocks.queryRaw.mockResolvedValue([{ count: 5, resetAt: inSeconds(60) }])
    expect(await checkLoginRateLimit('A@Example.com')).toEqual({ allowed: true })
    // The key is the normalized email, sent as a bound parameter.
    expect(mocks.queryRaw.mock.calls[0]).toContain('login:a@example.com')
  })

  it('blocks past the limit and reports when the window ends', async () => {
    mocks.queryRaw.mockResolvedValue([{ count: 6, resetAt: inSeconds(90) }])
    const result = await checkLoginRateLimit('a@example.com')
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(89)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(90)
  })

  it('clears the login bucket after a successful sign-in', async () => {
    await resetLoginRateLimit('A@example.com')
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { key: 'login:a@example.com' } })
  })

  it('falls back to a per-instance window when the database is unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.queryRaw.mockRejectedValue(new Error('relation "RateLimitBucket" does not exist'))
    const results = []
    for (let i = 0; i < 4; i++) results.push((await checkRateLimit('fallback-key', 3, 60_000)).allowed)
    expect(results).toEqual([true, true, true, false])
  })
})
