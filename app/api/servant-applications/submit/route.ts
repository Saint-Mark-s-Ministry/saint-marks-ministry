import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistrationStatus } from '@prisma/client'
import { notifyNewServantApplication } from '@/lib/notifications'
import { normalizeEmail } from '@/lib/email'
import { emailServantApplicationReceived } from '@/lib/mail/notify'

/**
 * POST /api/servant-applications/submit
 * Submit a Sunday School servant application (public endpoint, no invite
 * code — open registration, admin review is the safety net).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, fullName, phone, currentGrade } = body
    const normalizedEmail = normalizeEmail(email)
    const normalizedName = typeof fullName === 'string' ? fullName.trim() : ''
    const normalizedPhone = typeof phone === 'string' ? phone.trim() : ''
    const normalizedCurrentGrade =
      typeof currentGrade === 'string' ? currentGrade.trim() : ''

    if (!normalizedEmail || !normalizedName || !normalizedPhone || !normalizedCurrentGrade) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    const application = await prisma.$transaction(async (tx) => {
      const existingApplication = await tx.servantApplication.findFirst({
        where: {
          email: normalizedEmail,
          status: {
            in: [RegistrationStatus.PENDING, RegistrationStatus.APPROVED],
          },
        },
      })

      if (existingApplication) {
        throw new Error(
          'An application with this email is already pending or approved'
        )
      }

      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
      })

      if (existingUser) {
        throw new Error('A user with this email already exists')
      }

      return tx.servantApplication.create({
        data: {
          status: RegistrationStatus.PENDING,
          email: normalizedEmail,
          fullName: normalizedName,
          phone: normalizedPhone,
          // Compatibility column retained until the later contract migration.
          motivation: normalizedCurrentGrade,
        },
      })
    })

    try {
      // Wait for the in-app records to commit before completing the request.
      // A later notification-feed reconciliation repairs this if delivery is
      // temporarily unavailable without making the application look failed.
      await notifyNewServantApplication({
        applicantName: normalizedName,
        applicationId: application.id,
      })
    } catch (notificationError) {
      console.error('Failed to create servant application notifications:', notificationError)
    }
    emailServantApplicationReceived({ email: normalizedEmail, name: normalizedName })

    return NextResponse.json(
      {
        id: application.id,
        message:
          'Application submitted successfully! Your application is under review.',
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error('Error submitting servant application:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('already') ? 409 : 500

    return NextResponse.json({ error: message }, { status })
  }
}
