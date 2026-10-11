import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeEmail } from '@/lib/email'
import { checkRateLimit } from '@/lib/rate-limit'
import { emailPasswordReset } from '@/lib/mail/notify'

const SENT = { message: 'If an account exists for that email, we sent a link to reset the password.' }

/**
 * POST /api/auth/forgot-password { email }
 * Emails a one-hour reset link. Always answers the same way so the endpoint
 * can't be used to discover which addresses have accounts.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}))
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limits = await Promise.all([
    checkRateLimit(`forgot:${normalizedEmail}`, 3, 15 * 60 * 1000),
    checkRateLimit(`forgot-ip:${ip}`, 10, 15 * 60 * 1000),
  ])
  const blocked = limits.find((limit) => !limit.allowed)
  if (blocked) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(blocked.retryAfterSeconds ?? 900) } }
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true, authVersion: true, isDisabled: true },
  })
  if (user && !user.isDisabled) emailPasswordReset(user)

  return NextResponse.json(SENT)
}
