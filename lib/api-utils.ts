import { NextResponse } from "next/server"
import { UserRole } from "@prisma/client"
import { prisma } from "./prisma"
import { requireAuth } from "./auth-helpers"
import { asyncPeriodStart, isAsyncPeriodLesson } from "./attendance-utils"

/**
 * Standard API error response handler
 * Provides consistent error formatting across all API routes
 */
export function handleApiError(error: unknown): NextResponse {
  const requestId = crypto.randomUUID()
  // Error properties are non-enumerable, so log them explicitly; an Error inside
  // an object literal prints as {} in some runtimes.
  console.error(`API Error [${requestId}]:`, error instanceof Error ? (error.stack ?? error.message) : error)

  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error.message === "PasswordChangeRequired") {
      return NextResponse.json(
        { error: "PasswordChangeRequired", message: "You must change your password before continuing." },
        { status: 403 }
      )
    }
    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (error.message === "Not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    // Unexpected exception messages can contain SQL, table names, provider
    // details, or other implementation data. Keep them server-side and give
    // support a correlation ID instead.
    return NextResponse.json(
      { error: "Internal server error", requestId },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { error: "Internal server error", requestId },
    { status: 500 }
  )
}

/**
 * Reject URLs whose scheme could lead to script execution when rendered as
 * an href, since admin-supplied URLs are surfaced to every user. Only
 * http(s) are allowed; javascript:, data:, vbscript:, file:, etc. are not.
 */
export function assertSafeHttpUrl(input: string, fieldLabel = "URL"): string {
  const trimmed = (input ?? "").trim()
  if (!trimmed) {
    throw new Error(`${fieldLabel} cannot be empty`)
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`${fieldLabel} must be a valid http(s) URL`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${fieldLabel} must use http or https`)
  }
  return trimmed
}

/**
 * Parse time string (HH:MM or HH:MM:SS) into a Date object
 * Returns null if invalid or empty
 */
export function parseTimeString(timeStr: string | null | undefined): Date | null {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.trim()) {
    return null
  }

  // Handle both HH:MM and HH:MM:SS formats
  const trimmed = timeStr.trim()
  const parsedDate = new Date(`1970-01-01T${trimmed}`)

  return !isNaN(parsedDate.getTime()) ? parsedDate : null
}

/**
 * Get the list of student IDs that a mentor has access to
 * Returns undefined if user is not a mentor (meaning no filter needed)
 */
export async function getMentorStudentIds(userId: string, userRole: UserRole): Promise<string[] | undefined> {
  if (userRole !== UserRole.MENTOR) {
    return undefined
  }

  const mentees = await prisma.studentEnrollment.findMany({
    where: { mentorId: userId },
    select: { studentId: true }
  })

  return mentees.map(m => m.studentId)
}

/**
 * Wrapper for API route handlers with automatic error handling
 * Usage:
 * export const GET = withErrorHandler(async (request) => { ... })
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Wrapper for API route handlers with authentication and error handling
 * Automatically injects the authenticated user as the first argument to the handler
 * Usage:
 * export const GET = withAuth(async (user, request) => { ... })
 */
export function withAuth<T extends unknown[]>(
  handler: (user: Awaited<ReturnType<typeof requireAuth>>, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      const user = await requireAuth()
      return await handler(user, ...args)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Wrapper for API route handlers with role-based authorization
 * Usage:
 * export const GET = withRole([UserRole.SUPER_ADMIN, UserRole.PRIEST], async (user, request) => { ... })
 */
export function withRole<T extends unknown[]>(
  allowedRoles: UserRole[],
  handler: (user: Awaited<ReturnType<typeof requireAuth>>, ...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      const user = await requireAuth()
      if (!allowedRoles.includes(user.role)) {
        throw new Error("Forbidden")
      }
      return await handler(user, ...args)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

/**
 * Wrapper for API route handlers with admin-only access
 * Usage:
 * export const GET = withAdminAuth(async (user, request) => { ... })
 */
export function withAdminAuth<T extends unknown[]>(
  handler: (user: Awaited<ReturnType<typeof requireAuth>>, ...args: T) => Promise<NextResponse>
) {
  return withRole([UserRole.SUPER_ADMIN, UserRole.PRIEST, UserRole.SERVANT_PREP], handler)
}

/**
 * Backfill attendance records for students joining an academic year.
 * Creates ABSENT records for lessons that already have attendance taken while
 * preserving every historical record attached to earlier lessons.
 *
 * Can be called with a Prisma transaction client or the default prisma client.
 */
export async function backfillAttendanceForStudents(
  studentIds: string[],
  academicYearId: string | null,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  const uniqueStudentIds = [...new Set(studentIds)]
  if (!academicYearId || uniqueStudentIds.length === 0) return 0

  const db = tx || prisma

  // Find all non-cancelled, non-exam-day lessons in this academic year
  // that already have at least one attendance record (attendance was taken)
  const lessonsWithAttendance = await db.lesson.findMany({
    where: {
      academicYearId,
      status: { notIn: ['CANCELLED', 'NO_CLASS'] },
      isExamDay: false,
      attendanceRecords: { some: {} },
    },
    select: { id: true, scheduledDate: true },
  })

  if (lessonsWithAttendance.length === 0) return 0

  // Async students get no default absence for lessons from the day they went
  // async; their attendance is their Sunday School rotation.
  const asyncEnrollments = await db.studentEnrollment.findMany({
    where: { studentId: { in: uniqueStudentIds }, isAsyncStudent: true },
    select: { studentId: true, isAsyncStudent: true, asyncApprovedAt: true },
  })
  const asyncStart = new Map(asyncEnrollments.map(e => [e.studentId, asyncPeriodStart(e)]))

  // Check which student/lesson pairs already have records.
  const existingRecords = await db.attendanceRecord.findMany({
    where: {
      studentId: { in: uniqueStudentIds },
      lessonId: { in: lessonsWithAttendance.map(l => l.id) },
    },
    select: { lessonId: true, studentId: true },
  })
  const existingRecordKeys = new Set(
    existingRecords.map(record => `${record.studentId}:${record.lessonId}`)
  )

  // Create ABSENT records only for missing student/lesson pairs.
  const toCreate = uniqueStudentIds.flatMap(studentId =>
    lessonsWithAttendance
      .filter(lesson => !existingRecordKeys.has(`${studentId}:${lesson.id}`))
      .filter(lesson => !isAsyncPeriodLesson(lesson.scheduledDate, asyncStart.get(studentId) ?? null))
      .map(lesson => ({
        lessonId: lesson.id,
        studentId,
        status: 'ABSENT' as const,
        recordedBy: null,
      }))
  )

  if (toCreate.length > 0) {
    const result = await db.attendanceRecord.createMany({ data: toCreate, skipDuplicates: true })
    return result.count
  }

  return 0
}

export async function backfillAttendanceForStudent(
  studentId: string,
  academicYearId: string | null,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) {
  return backfillAttendanceForStudents([studentId], academicYearId, tx)
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/**
 * Enrollment fields that change with its status. Graduating records the date and
 * the active academic year; reactivating clears graduation data; only ACTIVE
 * enrollments stay isActive.
 */
export async function enrollmentStatusUpdate(
  status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN',
  graduationNote?: string | null
): Promise<Record<string, unknown>> {
  if (status === 'GRADUATED') {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
    return {
      status,
      isActive: false,
      graduatedAt: new Date(),
      ...(activeYear ? { graduatedAcademicYearId: activeYear.id } : {}),
      ...(graduationNote ? { graduationNote } : {}),
    }
  }
  if (status === 'ACTIVE') {
    return { status, isActive: true, graduatedAt: null, graduatedAcademicYearId: null, graduationNote: null }
  }
  return { status, isActive: false }
}

/**
 * Reconcile a student's attendance records against their attendance start date
 * (late-start curve). Lessons scheduled before the start date are marked
 * EXCUSED with notEnrolledYet=true (shown as "N/A — joined later" and excluded
 * from the attendance percentage). When the start date is cleared or moved
 * earlier, previously auto-excused records are reverted to ABSENT.
 *
 * Records that were excused for another reason (an expected absence, or a
 * manual conduct removal) are left untouched.
 */
export async function reconcileLateStartAttendance(
  studentId: string,
  attendanceStartDate: Date | null,
  tx?: PrismaTx
) {
  const db = tx || prisma

  // Revert records that were previously auto-excused but should no longer be
  // (start date cleared, or moved to on/before the lesson date).
  const previouslyExcused = await db.attendanceRecord.findMany({
    where: { studentId, notEnrolledYet: true },
    select: { id: true, lesson: { select: { scheduledDate: true } } },
  })

  const toRevert = previouslyExcused
    .filter(r => !attendanceStartDate || r.lesson.scheduledDate >= attendanceStartDate)
    .map(r => r.id)

  if (toRevert.length > 0) {
    await db.attendanceRecord.updateMany({
      where: { id: { in: toRevert } },
      data: { status: 'ABSENT', notEnrolledYet: false },
    })
  }

  if (!attendanceStartDate) return

  // Mark ABSENT records for lessons before the start date as EXCUSED /
  // not-enrolled-yet. Only ABSENT records are converted so we never overwrite a
  // Present/Late/Excused record (and reverting back to ABSENT stays lossless).
  const beforeStart = await db.attendanceRecord.findMany({
    where: {
      studentId,
      status: 'ABSENT',
      notEnrolledYet: false,
      expectedAbsenceId: null,
      conductRemoval: false,
      lesson: { scheduledDate: { lt: attendanceStartDate } },
    },
    select: { id: true },
  })

  if (beforeStart.length > 0) {
    await db.attendanceRecord.updateMany({
      where: { id: { in: beforeStart.map(r => r.id) } },
      data: { status: 'EXCUSED', notEnrolledYet: true },
    })
  }
}

/**
 * Apply a newly created expected absence to a student's existing attendance
 * records. Records whose lesson falls within the absence window are linked to
 * the expected absence with the reason written into their notes:
 *
 * - Default: ABSENT records stay ABSENT (they count against the attendance
 *   rate) until an admin manually excuses them. Present/Late/Excused records
 *   are left untouched.
 * - markAsNA: ABSENT and EXCUSED records are marked N/A (EXCUSED +
 *   expectedAbsenceNA), which excludes those lessons from the attendance rate.
 *
 * Conduct removals and late-start (notEnrolledYet) records are left untouched.
 */
export async function applyExpectedAbsenceToRecords(
  expectedAbsence: { id: string; studentId: string; startDate: Date; endDate: Date; reason: string; markAsNA: boolean },
  tx?: PrismaTx
) {
  const db = tx || prisma
  const { id, studentId, startDate, endDate, reason, markAsNA } = expectedAbsence

  const records = await db.attendanceRecord.findMany({
    where: {
      studentId,
      conductRemoval: false,
      notEnrolledYet: false,
      status: markAsNA ? { in: ['ABSENT', 'EXCUSED'] } : 'ABSENT',
      lesson: { scheduledDate: { gte: startDate, lte: endDate } },
    },
    select: { id: true },
  })

  if (records.length > 0) {
    await db.attendanceRecord.updateMany({
      where: { id: { in: records.map(r => r.id) } },
      data: markAsNA
        ? { status: 'EXCUSED', expectedAbsenceNA: true, expectedAbsenceId: id, notes: reason }
        : { expectedAbsenceNA: false, expectedAbsenceId: id, notes: reason },
    })
  }
}
