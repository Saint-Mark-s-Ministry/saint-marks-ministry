import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { AuditEventResult } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { recordAuditEvent } from '@/lib/audit'
import { MIN_PASSWORD_LENGTH, verifyPasswordToken } from '@/lib/password-reset'
import { resetLoginRateLimit } from '@/lib/rate-limit'
import { emailPasswordChanged } from '@/lib/mail/notify'

const INVALID = 'This link is invalid or has expired. Request a new one from “Forgot password?”.'

/**
 * POST /api/auth/reset-password { token, password }
 * Sets a password from a reset or setup link. The link is bound to the
 * account's authVersion, so it works once and dies with any password change.
 */
export async function POST(req: NextRequest) {
  const { token, password } = await req.json().catch(() => ({}))
  if (typeof token !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  }

  const verified = verifyPasswordToken(token)
  if (!verified.ok) {
    return NextResponse.json({ error: INVALID }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  // Matching on authVersion makes the write conditional: a used, superseded or
  // concurrently redeemed link updates nothing.
  const { count } = await prisma.user.updateMany({
    where: { id: verified.userId, authVersion: verified.authVersion, isDisabled: false },
    data: { password: hashedPassword, mustChangePassword: false },
  })
  if (count === 0) {
    return NextResponse.json({ error: INVALID }, { status: 400 })
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: verified.userId },
    select: { email: true, name: true },
  })
  await resetLoginRateLimit(user.email)
  await recordAuditEvent({
    actorUserId: verified.userId,
    action: 'AUTH_PASSWORD_RESET',
    entityType: 'User',
    entityId: verified.userId,
    result: AuditEventResult.SUCCESS,
    metadata: { purpose: verified.purpose },
  })
  // A setup link is the account's first password; there is nothing to warn about.
  if (verified.purpose === 'reset') emailPasswordChanged(user)

  return NextResponse.json({ message: 'Password updated. You can sign in now.' })
}
