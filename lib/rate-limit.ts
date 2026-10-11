import { prisma } from '@/lib/prisma'

/**
 * Fixed-window rate limits shared by every server instance: one row per key in
 * "RateLimitBucket", counted with a single atomic upsert. If the database call
 * fails (e.g. before the migration is applied), it falls back to a per-instance
 * in-memory window rather than blocking sign-in.
 */

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number }

const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

const loginKey = (email: string) => `login:${email.toLowerCase()}`

export function checkLoginRateLimit(email: string): Promise<RateLimitResult> {
  return checkRateLimit(loginKey(email), MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS)
}

export async function resetLoginRateLimit(email: string): Promise<void> {
  const key = loginKey(email)
  memory.delete(key)
  try {
    await prisma.rateLimitBucket.deleteMany({ where: { key } })
  } catch (error) {
    warnFallback(error)
  }
}

export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  let bucket: { count: number; resetAt: Date }
  try {
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, now() + ${windowMs} * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`
    bucket = rows[0]
    // ponytail: opportunistic cleanup of expired rows; move to a cron if the table grows.
    if (Math.random() < 0.01) void prisma.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } }).catch(() => {})
  } catch (error) {
    warnFallback(error)
    bucket = hitMemory(key, windowMs)
  }

  if (bucket.count <= max) return { allowed: true }
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000)) }
}

// ------------------------------------------------------------ in-memory fallback

const memory = new Map<string, { count: number; resetAt: Date }>()

function hitMemory(key: string, windowMs: number) {
  const now = Date.now()
  const entry = memory.get(key)
  if (!entry || entry.resetAt.getTime() <= now) {
    const fresh = { count: 1, resetAt: new Date(now + windowMs) }
    memory.set(key, fresh)
    return fresh
  }
  entry.count++
  return entry
}

let warned = false
function warnFallback(error: unknown) {
  if (warned) return
  warned = true
  console.error('[rate-limit] database limiter unavailable; using per-instance memory:', error instanceof Error ? error.message : error)
}
