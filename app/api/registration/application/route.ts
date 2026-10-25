import { findOrCreateFatherOfConfession } from '@/lib/father-of-confession'
import { NextRequest, NextResponse } from 'next/server'
import { NotificationType, RegistrationStatus } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { normalizeOptionalEmail } from '@/lib/email'
import { getAnnualMentorRequirement } from '@/lib/annual-mentor-information'
import { prisma } from '@/lib/prisma'

type ApplicationDetails = {
  id: string
  fatherOfConfessionName: string | null
  approvalFormUrl: string | null
  approvalFormFilename: string | null
  mentorName: string | null
  mentorPhone: string | null
  mentorEmail: string | null
}

type MentorDetails = {
  mentorName: string | null
  mentorPhone: string | null
  mentorEmail: string | null
  reviewedAt?: Date | null
}

function getMissingDetails(
  application: ApplicationDetails | null,
  annualMentorRequired: boolean,
  annualMentorInformation: MentorDetails | null,
  approvalForm: { approvalFormUrl: string | null; approvalFormFilename: string | null } | null = application
) {
  return [
    application && !application.fatherOfConfessionName ? 'fatherOfConfession' : null,
    (application || annualMentorRequired) && (!approvalForm?.approvalFormUrl || !approvalForm?.approvalFormFilename)
      ? 'approvalForm'
      : null,
    annualMentorRequired
      ? !annualMentorInformation?.reviewedAt ? 'mentorInformation' : null
      : application && (!application.mentorName || !application.mentorPhone || !application.mentorEmail)
        ? 'mentorInformation'
        : null,
  ].filter((detail): detail is string => Boolean(detail))
}

async function getApprovedApplication(userId: string) {
  return prisma.registrationSubmission.findFirst({
    where: { createdUserId: userId, status: RegistrationStatus.APPROVED },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      fatherOfConfessionName: true,
      approvalFormUrl: true,
      approvalFormFilename: true,
      mentorName: true,
      mentorPhone: true,
      mentorEmail: true,
    },
  })
}

async function getApplicationState(userId: string) {
  const [application, annualRequirement] = await Promise.all([
    getApprovedApplication(userId),
    getAnnualMentorRequirement(userId),
  ])

  if (!application && !annualRequirement) return null

  const annualInformation = annualRequirement?.information ?? null
  const mentorDetails = annualInformation ?? application ?? {
    mentorName: annualRequirement?.enrollment.mentorName ?? null,
    mentorPhone: annualRequirement?.enrollment.mentorPhone ?? null,
    mentorEmail: null,
  }
  const missingDetails = getMissingDetails(
    application,
    Boolean(annualRequirement),
    annualInformation,
    application ?? annualRequirement?.enrollment ?? null
  )

  return {
    application,
    annualRequirement,
    missingDetails,
    details: {
      fatherOfConfessionName: application?.fatherOfConfessionName ?? null,
      approvalFormUrl: application?.approvalFormUrl ?? annualRequirement?.enrollment.approvalFormUrl ?? null,
      approvalFormFilename: application?.approvalFormFilename ?? annualRequirement?.enrollment.approvalFormFilename ?? null,
      mentorName: mentorDetails.mentorName,
      mentorPhone: mentorDetails.mentorPhone,
      mentorEmail: mentorDetails.mentorEmail,
    },
  }
}

export async function GET() {
  try {
    const user = await requireAuth()
    const state = await getApplicationState(user.id)

    if (!state) {
      return NextResponse.json({ error: 'Application information not found' }, { status: 404 })
    }

    return NextResponse.json({
      application: state.details,
      showChurchInformation: Boolean(state.application),
      showApprovalForm: true,
      mentorReviewStatus: state.annualRequirement ? (state.annualRequirement.information?.reviewedAt ? "REVIEWED" : state.annualRequirement.information ? "PENDING_REVIEW" : "UPDATE_REQUIRED") : null,
      annualMentorRequired: Boolean(state.annualRequirement),
      academicYear: state.annualRequirement?.activeYear ?? null,
      missingDetails: state.missingDetails,
      complete: state.missingDetails.length === 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuth()
    const state = await getApplicationState(user.id)

    if (!state) {
      return NextResponse.json({ error: 'Application information not found' }, { status: 404 })
    }

    const body = await request.json()
    const fatherOfConfessionName = typeof body.fatherOfConfessionName === 'string'
      ? body.fatherOfConfessionName.trim()
      : ''
    const mentorName = typeof body.mentorName === 'string' ? body.mentorName.trim() : ''
    const mentorPhone = typeof body.mentorPhone === 'string' ? body.mentorPhone.trim() : ''
    const mentorEmail = normalizeOptionalEmail(body.mentorEmail) ?? ''

    if ((state.application && !fatherOfConfessionName) || !mentorName || !mentorPhone || !mentorEmail) {
      return NextResponse.json(
        {
          error: state.application
            ? 'Father of confession and all mentor fields are required'
            : 'All mentor fields are required',
        },
        { status: 400 }
      )
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) {
      return NextResponse.json({ error: 'Invalid mentor email format' }, { status: 400 })
    }

    const result = await prisma.$transaction(async (tx) => {
      let fatherOfConfessionId: string | undefined
      let updatedApplication = state.application

      if (state.application) {
        const { father: fatherOfConfession } = await findOrCreateFatherOfConfession(tx, { name: fatherOfConfessionName })
        fatherOfConfessionId = fatherOfConfession.id

        updatedApplication = await tx.registrationSubmission.update({
          where: { id: state.application.id },
          data: { fatherOfConfessionName, mentorName, mentorPhone, mentorEmail },
          select: {
            id: true,
            fatherOfConfessionName: true,
            approvalFormUrl: true,
            approvalFormFilename: true,
            mentorName: true,
            mentorPhone: true,
            mentorEmail: true,
          },
        })
      }

      await tx.studentEnrollment.updateMany({
        where: { studentId: user.id },
        data: {
          ...(fatherOfConfessionId ? { fatherOfConfessionId } : {}),
          mentorName,
          mentorPhone,
        },
      })

      if (state.annualRequirement) {
        await tx.annualMentorInformation.upsert({
          where: {
            studentId_academicYearId: {
              studentId: user.id,
              academicYearId: state.annualRequirement.activeYear.id,
            },
          },
          create: {
            studentId: user.id,
            academicYearId: state.annualRequirement.activeYear.id,
            mentorName,
            mentorPhone,
            mentorEmail,
          },
          update: { mentorName, mentorPhone, mentorEmail, submittedAt: new Date(), reviewedAt: null, reviewedBy: null },
        })
      }

      const details = {
        fatherOfConfessionName: updatedApplication?.fatherOfConfessionName ?? null,
        approvalFormUrl: updatedApplication?.approvalFormUrl ?? state.details.approvalFormUrl,
        approvalFormFilename: updatedApplication?.approvalFormFilename ?? state.details.approvalFormFilename,
        mentorName,
        mentorPhone,
        mentorEmail,
      }
      const missingDetails = getMissingDetails(
        updatedApplication,
        Boolean(state.annualRequirement),
        state.annualRequirement ? { mentorName, mentorPhone, mentorEmail } : null,
        details
      )

      if (missingDetails.length === 0) {
        await tx.notification.deleteMany({
          where: {
            userId: user.id,
            type: NotificationType.REGISTRATION_INCOMPLETE,
            isPersistent: true,
          },
        })
      }

      return { details, missingDetails }
    })

    return NextResponse.json({
      application: result.details,
      showChurchInformation: Boolean(state.application),
      showApprovalForm: true,
      mentorReviewStatus: state.annualRequirement ? "PENDING_REVIEW" : null,
      annualMentorRequired: Boolean(state.annualRequirement),
      academicYear: state.annualRequirement?.activeYear ?? null,
      missingDetails: result.missingDetails,
      complete: result.missingDetails.length === 0,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
