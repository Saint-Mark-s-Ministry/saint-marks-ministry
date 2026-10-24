import { EnrollmentYearError, resolveEnrollmentYear } from '@/lib/enrollment-year'
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canManageEnrollments } from '@/lib/roles'
import { backfillAttendanceForStudents, enrollmentStatusUpdate } from '@/lib/api-utils'
import { resetYearTwoMentors } from '@/lib/mentor-assignments'

interface BulkUpdateRequest {
  enrollmentIds: string[]
  updates: {
    yearLevel?: 'YEAR_1' | 'YEAR_2'
    status?: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
    isActive?: boolean
    graduationNote?: string  // Required when graduating students who don't meet requirements
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canManageEnrollments(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body: BulkUpdateRequest = await req.json()
    const { enrollmentIds, updates } = body

    if (!enrollmentIds || !Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return NextResponse.json({ error: 'enrollmentIds array is required' }, { status: 400 })
    }

    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 })
    }

    // Build the update data
    const updateData: Record<string, unknown> = {}

    if (updates.yearLevel !== undefined) {
      updateData.yearLevel = resolveEnrollmentYear({ isAsyncStudent: false, yearLevel: null }, { yearLevel: updates.yearLevel })
    }

    if (updates.status) {
      Object.assign(updateData, await enrollmentStatusUpdate(updates.status, updates.graduationNote))
    }

    if (updates.isActive !== undefined && !updates.status) {
      updateData.isActive = updates.isActive
    }

    // Perform bulk update using a transaction
    const result = await prisma.$transaction(async (tx) => {
      const currentEnrollments = updates.yearLevel !== undefined
        ? await tx.studentEnrollment.findMany({
            where: { id: { in: enrollmentIds } },
            select: { id: true, studentId: true, mentorId: true, yearLevel: true, isActive: true, isAsyncStudent: true },
          })
        : []

      if (currentEnrollments.some(enrollment => enrollment.isAsyncStudent)) {
        throw new EnrollmentYearError('Async students cannot be moved to a year level; switch them to in-person first')
      }

      let activeAcademicYearId: string | null = null
      let attendanceRecordsCreated = 0
      const promotions = updates.yearLevel === 'YEAR_2'
        ? currentEnrollments.filter(enrollment => enrollment.yearLevel !== 'YEAR_2')
        : []
      const promotedStudentIds = promotions.filter(enrollment => enrollment.isActive).map(enrollment => enrollment.studentId)

      if (promotions.length) {
        const activeAcademicYear = await tx.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        })

        if (!activeAcademicYear && promotedStudentIds.length) {
          throw new Error('No active academic year is configured for Year 2 promotion')
        }

        activeAcademicYearId = activeAcademicYear?.id ?? null
      }

      const updated = await tx.studentEnrollment.updateMany({
        where: {
          id: { in: enrollmentIds }
        },
        data: updateData
      })

      await resetYearTwoMentors(tx, promotions, session.user.id, activeAcademicYearId)

      if (activeAcademicYearId && promotedStudentIds.length > 0) {
        attendanceRecordsCreated = await backfillAttendanceForStudents(
          promotedStudentIds,
          activeAcademicYearId,
          tx
        )
      }

      return {
        count: updated.count,
        promotedCount: promotedStudentIds.length,
        activeAcademicYearId,
        attendanceRecordsCreated,
      }
    }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${result.count} enrollment(s)`,
      count: result.count,
      promotion: updates.yearLevel === 'YEAR_2'
        ? {
            promotedCount: result.promotedCount,
            historicalAttendancePreserved: true,
            activeAcademicYearId: result.activeAcademicYearId,
            attendanceRecordsCreated: result.attendanceRecordsCreated,
          }
        : null,
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return NextResponse.json({ error: 'Enrollments changed while saving. Refresh and try again.' }, { status: 409 })
    }
    if (error instanceof EnrollmentYearError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('Bulk update error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update enrollments'
    return NextResponse.json(
      { error: message },
      { status: message.includes('No active academic year') ? 409 : 500 }
    )
  }
}
