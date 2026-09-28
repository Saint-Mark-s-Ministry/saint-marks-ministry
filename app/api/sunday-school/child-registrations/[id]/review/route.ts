import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import {
  canCoordinateClass,
  canReviewChildRegistrationAtLevel,
  getSundaySchoolAccess,
} from '@/lib/sunday-school-access'
import { notifyChildRegistrationReviewed } from '@/lib/notifications'
import { RegistrationStatus, RoleGrantSource, RoleTag } from '@prisma/client'

/**
 * POST /api/sunday-school/child-registrations/[id]/review
 * Approve or reject a child registration request. Approving requires a
 * classId — the reviewer places the child into a specific class, which is
 * when the real SundaySchoolChild row and the parent<->child guardian link
 * get created.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await req.json()
    const { action, note, classId } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    const registrationRequest = await prisma.childRegistrationRequest.findUnique({
      where: { id },
    })

    if (!registrationRequest) {
      return NextResponse.json({ error: 'Registration request not found' }, { status: 404 })
    }

    if (registrationRequest.status !== RegistrationStatus.PENDING) {
      return NextResponse.json(
        { error: 'Only pending requests can be reviewed' },
        { status: 400 }
      )
    }

    if (action === 'approve') {
      if (!classId) {
        return NextResponse.json(
          { error: 'classId is required to approve a registration request' },
          { status: 400 }
        )
      }

      const targetClass = await prisma.sundaySchoolClass.findUnique({
        where: { id: classId },
        select: {
          id: true,
          name: true,
          level: true,
          academicYearId: true,
          sundaySchoolYearId: true,
          status: true,
          isActive: true,
        },
      })

      if (!targetClass) {
        return NextResponse.json({ error: 'Class not found' }, { status: 404 })
      }

      if (!targetClass.isActive || targetClass.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'The selected class is archived' }, { status: 400 })
      }

      if (targetClass.level !== registrationRequest.intendedLevel) {
        return NextResponse.json(
          { error: 'The selected class does not match this request\'s intended level' },
          { status: 400 }
        )
      }

      if (
        registrationRequest.sundaySchoolYearId &&
        registrationRequest.sundaySchoolYearId !== targetClass.sundaySchoolYearId
      ) {
        return NextResponse.json(
          { error: 'The selected class belongs to a different Sunday School year' },
          { status: 400 }
        )
      }

      if (!targetClass.sundaySchoolYearId) {
        return NextResponse.json(
          { error: 'The selected class is not linked to a Sunday School year' },
          { status: 409 }
        )
      }
      const targetSundaySchoolYearId = targetClass.sundaySchoolYearId

      const targetAccess = await getSundaySchoolAccess(user, targetClass.academicYearId)
      if (
        !canReviewChildRegistrationAtLevel(targetAccess, registrationRequest.intendedLevel) ||
        !canCoordinateClass(targetAccess, targetClass.id)
      ) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const result = await prisma.$transaction(async (tx) => {
        const child = await tx.sundaySchoolChild.create({
          data: {
            firstName: registrationRequest.firstName,
            lastName: registrationRequest.lastName,
            level: registrationRequest.intendedLevel,
            classId: targetClass.id,
            birthDate: registrationRequest.birthDate,
            gender: registrationRequest.gender,
            guardianName: registrationRequest.guardianName,
            guardianPhone: registrationRequest.guardianPhone,
            guardianEmail: registrationRequest.guardianEmail,
            notes: registrationRequest.notes,
            status: 'ACTIVE',
            isActive: true,
          },
        })

        const enrollment = await tx.sundaySchoolEnrollment.create({
          data: {
            childId: child.id,
            sundaySchoolYearId: targetSundaySchoolYearId,
            level: registrationRequest.intendedLevel,
          },
        })

        await tx.sundaySchoolClassPlacement.create({
          data: {
            enrollmentId: enrollment.id,
            classId: targetClass.id,
            sundaySchoolYearId: targetSundaySchoolYearId,
            level: registrationRequest.intendedLevel,
            movedById: user.id,
            moveReason: 'Initial child registration placement',
          },
        })

        const guardianProfile = await tx.sundaySchoolGuardianProfile.upsert({
          where: { userId: registrationRequest.submittedByUserId },
          update: {
            email: registrationRequest.guardianEmail,
            phone: registrationRequest.guardianPhone,
            status: 'ACTIVE',
          },
          create: {
            userId: registrationRequest.submittedByUserId,
            firstName: registrationRequest.guardianName,
            lastName: '',
            email: registrationRequest.guardianEmail,
            phone: registrationRequest.guardianPhone,
          },
        })

        await tx.sundaySchoolChildGuardian.create({
          data: {
            parentId: registrationRequest.submittedByUserId,
            childId: child.id,
            guardianProfileId: guardianProfile.id,
            linkedById: user.id,
            relationshipLabel: 'Parent/Guardian',
          },
        })

        const parentRole = await tx.userRoleAssignment.findFirst({
          where: {
            userId: registrationRequest.submittedByUserId,
            tag: RoleTag.PARENT,
            revokedAt: null,
          },
          select: { id: true },
        })
        if (!parentRole) {
          await tx.userRoleAssignment.create({
            data: {
              userId: registrationRequest.submittedByUserId,
              tag: RoleTag.PARENT,
              source: RoleGrantSource.CHILD_REGISTRATION,
              grantedById: user.id,
            },
          })
        }

        const updatedRequest = await tx.childRegistrationRequest.update({
          where: { id },
          data: {
            status: RegistrationStatus.APPROVED,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            reviewNote: note || null,
            createdChildId: child.id,
            placedClassId: targetClass.id,
            sundaySchoolYearId: targetSundaySchoolYearId,
            resultingEnrollmentId: enrollment.id,
          },
        })

        return { child, enrollment, request: updatedRequest }
      })

      notifyChildRegistrationReviewed({
        userId: registrationRequest.submittedByUserId,
        status: 'APPROVED',
        childName: `${registrationRequest.firstName} ${registrationRequest.lastName}`,
        className: targetClass.name,
      }).catch(() => {})

      return NextResponse.json({
        request: result.request,
        child: result.child,
        message: 'Registration request approved successfully',
      })
    } else {
      const access = await getSundaySchoolAccess(user)
      if (!canReviewChildRegistrationAtLevel(access, registrationRequest.intendedLevel)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const updatedRequest = await prisma.childRegistrationRequest.update({
        where: { id },
        data: {
          status: RegistrationStatus.REJECTED,
          reviewedBy: user.id,
          reviewedAt: new Date(),
          reviewNote: note || null,
        },
      })

      notifyChildRegistrationReviewed({
        userId: registrationRequest.submittedByUserId,
        status: 'REJECTED',
        childName: `${registrationRequest.firstName} ${registrationRequest.lastName}`,
      }).catch(() => {})

      return NextResponse.json({
        request: updatedRequest,
        message: 'Registration request rejected',
      })
    }
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
