import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { checkLoginRateLimit, resetLoginRateLimit } from '@/lib/rate-limit'
import { normalizeEmail } from '@/lib/email'
import { emailParentWelcome } from '@/lib/mail/notify'

/**
 * POST /api/auth/signup/parent
 * Instant, self-serve parent account creation (public). Unlike every other
 * onboarding path in this app, there is no approval gate on the account
 * itself — a parent has no authority over anyone else's data, only their own
 * linked children, so mustChangePassword is false: they chose their own
 * password.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, fullName, phone, password, confirmPassword } = body

    if (!email || !fullName || !password || !confirmPassword) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(email)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      )
    }

    const rateLimit = await checkLoginRateLimit(normalizedEmail)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Too many signup attempts. Please try again in ${rateLimit.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: fullName,
        phone: phone || null,
        password: hashedPassword,
        role: UserRole.PARENT,
        mustChangePassword: false,
        isDisabled: false,
      },
    })

    await resetLoginRateLimit(normalizedEmail)
    emailParentWelcome({ email: user.email, name: user.name })

    return NextResponse.json(
      { id: user.id, message: 'Account created successfully' },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error('Error creating parent account:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
