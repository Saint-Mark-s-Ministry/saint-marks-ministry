import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isInviteCodeValid } from '@/lib/registration-utils'
import { StudentGrade, RegistrationStatus } from '@prisma/client'
import { notifyNewRegistration } from '@/lib/notifications'
import { normalizeEmail } from '@/lib/email'
import { emailRegistrationReceived } from '@/lib/mail/notify'

/**
 * POST /api/registration/submit
 * Submit a registration form (public endpoint, requires valid invite code)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      inviteCode,
      email,
      fullName,
      dateOfBirth,
      phone,
      previouslyServed,
      previousServiceLocation,
      currentlyServing,
      previouslyAttendedPrep,
      previousPrepLocation,
      grade,
      profileImageUrl,
      profileImageFilename,
    } = body
    const normalizedEmail = normalizeEmail(email)
    const normalizedPreviousServiceLocation = typeof previousServiceLocation === 'string'
      ? previousServiceLocation.trim()
      : ''
    const normalizedPreviousPrepLocation = typeof previousPrepLocation === 'string'
      ? previousPrepLocation.trim()
      : ''

    // Validate required fields
    if (
      !inviteCode ||
      !normalizedEmail ||
      !fullName ||
      !dateOfBirth ||
      !phone ||
      previouslyServed === undefined ||
      currentlyServing === undefined ||
      previouslyAttendedPrep === undefined ||
      !grade ||
      !profileImageUrl ||
      !profileImageFilename
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate grade enum
    if (!Object.values(StudentGrade).includes(grade as StudentGrade)) {
      return NextResponse.json(
        { error: 'Invalid grade selection' },
        { status: 400 }
      )
    }

    if (previouslyServed && !normalizedPreviousServiceLocation) {
      return NextResponse.json(
        { error: 'Previous service location is required when you have served before' },
        { status: 400 }
      )
    }

    // Validate previousPrepLocation is required if previouslyAttendedPrep is true
    if (previouslyAttendedPrep && !normalizedPreviousPrepLocation) {
      return NextResponse.json(
        { error: 'Previous prep location is required when you have attended before' },
        { status: 400 }
      )
    }

    // Check if registration is enabled
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 'default' },
    })

    if (settings && !settings.registrationEnabled) {
      return NextResponse.json(
        { error: 'Registration is currently closed' },
        { status: 403 }
      )
    }

    // Use a transaction to validate and create submission atomically
    const submission = await prisma.$transaction(async (tx) => {
      // Validate invite code
      const code = await tx.inviteCode.findUnique({
        where: { code: inviteCode.toUpperCase().trim() },
      })

      if (!code) {
        throw new Error('Invalid invite code')
      }

      const validation = isInviteCodeValid(code)
      if (!validation.valid) {
        throw new Error('Invalid or expired invite code')
      }

      // Check if code can still be used
      if (code.maxUses > 0 && code.usageCount >= code.maxUses) {
        throw new Error('Invite code has reached maximum usage')
      }

      // Registration is only for new applicants. Existing users complete
      // their application from inside their account.
      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      })

      if (existingUser) {
        throw new Error(
          'An account with this email already exists. Please sign in; registration is only for new applicants.'
        )
      }

      // One open application per email at a time
      const pendingSubmission = await tx.registrationSubmission.findFirst({
        where: {
          email: normalizedEmail,
          status: RegistrationStatus.PENDING,
        },
        select: { id: true },
      })

      if (pendingSubmission) {
        throw new Error('A registration with this email is already pending review')
      }

      const approvedSubmission = await tx.registrationSubmission.findFirst({
        where: {
          email: normalizedEmail,
          status: RegistrationStatus.APPROVED,
        },
        select: { id: true },
      })

      if (approvedSubmission) {
        throw new Error('A registration with this email has already been approved')
      }

      // Create submission
      const newSubmission = await tx.registrationSubmission.create({
        data: {
          inviteCodeId: code.id,
          status: RegistrationStatus.PENDING,
          email: normalizedEmail,
          fullName,
          dateOfBirth: new Date(dateOfBirth),
          phone,
          fatherOfConfessionName: null,
          previouslyServed,
          previousServiceLocation: previouslyServed ? normalizedPreviousServiceLocation : null,
          currentlyServing,
          previouslyAttendedPrep,
          previousPrepLocation: previouslyAttendedPrep ? normalizedPreviousPrepLocation : null,
          grade: grade as StudentGrade,
          approvalFormUrl: null,
          approvalFormFilename: null,
          profileImageUrl,
          profileImageFilename,
          mentorName: null,
          mentorPhone: null,
          mentorEmail: null,
          createdUserId: null,
        },
      })

      // Increment usage count
      await tx.inviteCode.update({
        where: { id: code.id },
        data: {
          usageCount: {
            increment: 1,
          },
        },
      })

      return newSubmission
    })

    // Notify admins about new registration (non-blocking)
    notifyNewRegistration({
      applicantName: fullName,
      registrationId: submission.id,
    }).catch(() => {})
    emailRegistrationReceived({ email: normalizedEmail, name: fullName })

    return NextResponse.json(
      {
        id: submission.id,
        message:
          'Registration submitted successfully! Your registration is under review.',
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    console.error('Error submitting registration:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message.includes('Invalid') || message.includes('expired') || message.includes('maximum usage')
      ? 400
      : message.includes('already')
      ? 409
      : 500

    return NextResponse.json({ error: message }, { status })
  }
}
