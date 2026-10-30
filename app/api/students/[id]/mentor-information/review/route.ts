import { NextRequest, NextResponse } from 'next/server'
import { NotificationType, RoleTag } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, canWriteBusinessData } from '@/lib/authorization'
import { getAnnualMentorRequirement } from '@/lib/annual-mentor-information'
import { enrollmentStatusUpdate, handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (!canWriteBusinessData(context) || context.roleTags.has(RoleTag.PRIEST) ||
      (!context.roleTags.has(RoleTag.SUPER_ADMIN) && !context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const requirement = await getAnnualMentorRequirement(id)
    if (!requirement?.information) {
      return NextResponse.json({ error: 'No current mentor submission to review' }, { status: 404 })
    }
    const body = await request.json()
    if (body.updatedAt !== requirement.information.updatedAt.toISOString()) {
      return NextResponse.json({ error: 'Mentor information changed. Refresh before reviewing.' }, { status: 409 })
    }
    // Match the version the administrator read so a concurrent resubmission
    // cannot accidentally receive approval for the previous contact details.
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.annualMentorInformation.updateMany({
        where: { id: requirement.information!.id, updatedAt: requirement.information!.updatedAt },
        data: { reviewedAt: new Date(), reviewedBy: user.id },
      })
      let reactivated = false
      if (updated.count === 1) {
        // A pending form's approval restores attendance eligibility atomically.
        // Re-reviewing an approved form must not undo a later withdrawal, and
        // a concurrent graduation must never be changed back to Active.
        if (!requirement.information!.reviewedAt && requirement.enrollment.status === 'WITHDRAWN') {
          const activated = await tx.studentEnrollment.updateMany({
            where: { id: requirement.enrollment.id, studentId: id, status: 'WITHDRAWN', yearLevel: 'YEAR_2' },
            data: await enrollmentStatusUpdate('ACTIVE'),
          })
          reactivated = activated.count === 1
        }
        await tx.notification.deleteMany({
          where: {
            userId: id,
            type: NotificationType.REGISTRATION_INCOMPLETE,
            isPersistent: true,
            metadata: { path: ['academicYearId'], equals: requirement.activeYear.id },
          },
        })
        await tx.notification.deleteMany({ where: {
          type: NotificationType.ANNOUNCEMENT,
          AND: [
            { metadata: { path: ['kind'], equals: 'annualMentorReview' } },
            { metadata: { path: ['studentId'], equals: id } },
            { metadata: { path: ['academicYearId'], equals: requirement.activeYear.id } },
          ],
        } })
      }
      return { count: updated.count, reactivated }
    })
    if (result.count !== 1) {
      return NextResponse.json({ error: 'Mentor information changed. Refresh before reviewing.' }, { status: 409 })
    }
    return NextResponse.json({ reviewed: true, reactivated: result.reactivated })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
