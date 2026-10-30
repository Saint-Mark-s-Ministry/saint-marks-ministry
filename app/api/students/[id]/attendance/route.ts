import { LessonStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api-utils'
import { getAuthorizationContext, scopeAllows } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'

/** Read-only Prep history. Recheck the current principal and mentor scope on every request. */
export const GET = withAuth(async (user, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: studentId } = await params
  const access = await getAuthorizationContext(user.id)
  if (access.disabled || !scopeAllows(access.prepStudentScope, studentId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const enrollment = await prisma.studentEnrollment.findUnique({
    where: { studentId },
    select: { isAsyncStudent: true },
  })
  if (!enrollment) return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 })

  // Even historical lesson records do not apply to a current async student.
  const records = enrollment.isAsyncStudent ? [] : await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      lesson: { isExamDay: false, status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] } },
    },
    select: {
      id: true,
      status: true,
      notEnrolledYet: true,
      expectedAbsenceNA: true,
      lesson: { select: { title: true, scheduledDate: true } },
    },
    orderBy: [{ lesson: { scheduledDate: 'desc' } }, { id: 'desc' }],
  })

  return NextResponse.json({ isAsyncStudent: enrollment.isAsyncStudent, records }, {
    headers: { 'Cache-Control': 'private, no-store' },
  })
})
