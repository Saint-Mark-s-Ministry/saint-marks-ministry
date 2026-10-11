import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { canReviewServantApplications } from '@/lib/roles'
import { NotificationType, RegistrationStatus, RoleGrantSource, RoleTag, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { notifyServantApplicationReviewed } from '@/lib/notifications'
import { generateTempPassword } from '@/lib/registration-utils'
import { emailServantApplicationApproved, emailServantApplicationNotApproved } from '@/lib/mail/notify'

/**
 * POST /api/servant-applications/[id]/review
 * Approve or reject a servant application
 * Auth: SUPER_ADMIN only (servant accounts are never SERVANT_PREP-created —
 * see lib/roles.ts canReviewServantApplications)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    if (!canReviewServantApplications(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await req.json()
    const { action, note } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      const result = await prisma.$transaction(async (tx) => {
        const application = await tx.servantApplication.findUnique({
          where: { id },
        })

        if (!application) {
          throw new Error('Servant application not found')
        }

        if (application.status !== RegistrationStatus.PENDING) {
          throw new Error('Only pending applications can be reviewed')
        }

        const existingUser = await tx.user.findUnique({
          where: { email: application.email },
        })

        if (existingUser) {
          throw new Error('A user with this email already exists')
        }

        // Fallback for the reviewer to share; the applicant is emailed a set-password link.
        const tempPassword = generateTempPassword()
        const hashedPassword = await bcrypt.hash(tempPassword, 10)

        const newUser = await tx.user.create({
          data: {
            email: application.email,
            name: application.fullName,
            password: hashedPassword,
            role: UserRole.SERVANT,
            phone: application.phone,
            mustChangePassword: true,
            isDisabled: false,
            roleAssignments: {
              create: {
                tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
                source: RoleGrantSource.SUNDAY_SCHOOL_ACCOUNT,
                grantedById: user.id,
                note: 'Granted when servant application was approved',
              },
            },
          },
        })

        const updatedApplication = await tx.servantApplication.update({
          where: { id },
          data: {
            status: RegistrationStatus.APPROVED,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNote: note || null,
            createdUserId: newUser.id,
          },
          include: {
            reviewer: { select: { id: true, name: true, email: true } },
            createdUser: { select: { id: true, name: true, email: true } },
          },
        })

        await tx.notification.deleteMany({
          where: {
            type: NotificationType.SERVANT_APPLICATION_RECEIVED,
            metadata: { path: ['applicationId'], equals: id },
          },
        })

        return { application: updatedApplication, tempPassword, account: { id: newUser.id, authVersion: newUser.authVersion } }
      })

      emailServantApplicationApproved({
        ...result.account,
        email: result.application.email,
        name: result.application.fullName,
      })

      if (result.application.createdUser) {
        notifyServantApplicationReviewed({
          userId: result.application.createdUser.id,
          status: 'APPROVED',
          applicantName: result.application.fullName,
        }).catch(() => {})
      }

      return NextResponse.json({
        application: result.application,
        tempPassword: result.tempPassword,
        message: 'Application approved successfully',
      })
    } else {
      const updatedApplication = await prisma.$transaction(async (tx) => {
        const application = await tx.servantApplication.findUnique({
          where: { id },
        })

        if (!application) {
          throw new Error('Servant application not found')
        }

        if (application.status !== RegistrationStatus.PENDING) {
          throw new Error('Only pending applications can be reviewed')
        }

        const updated = await tx.servantApplication.update({
          where: { id },
          data: {
            status: RegistrationStatus.REJECTED,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNote: note || null,
          },
          include: {
            reviewer: { select: { id: true, name: true, email: true } },
          },
        })

        await tx.notification.deleteMany({
          where: {
            type: NotificationType.SERVANT_APPLICATION_RECEIVED,
            metadata: { path: ['applicationId'], equals: id },
          },
        })

        return updated
      })

      emailServantApplicationNotApproved({ email: updatedApplication.email, name: updatedApplication.fullName })

      return NextResponse.json({
        application: updatedApplication,
        message: 'Application rejected',
      })
    }
  } catch (error: unknown) {
    console.error('Error reviewing servant application:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status =
      message === 'Unauthorized'
        ? 401
        : message === 'PasswordChangeRequired'
          ? 403
          : message === 'Forbidden'
          ? 403
          : message.includes('not found')
            ? 404
            : message.includes('pending') || message.includes('already exists')
              ? 400
              : 500

    return NextResponse.json({ error: message }, { status })
  }
}
