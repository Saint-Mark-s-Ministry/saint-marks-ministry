import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { UserRole, SundaySchoolGrade, YearLevel } from "@prisma/client"
import { canManageSundaySchool, isAdmin } from "@/lib/roles"
import { getMentorStudentIds } from "@/lib/api-utils"
import { rotationAttendanceToDate, rotationGradeForClassLevel } from "@/lib/sunday-school-utils"

// GET /api/sunday-school/assignments - List assignments with filters
// Query params:
//   ?studentId=xxx - filter by student
//   ?academicYearId=xxx - filter by academic year
//   ?grade=GRADE_1 - filter by Sunday School grade
//   ?isActive=true - filter by active status
//   ?classOptions=true - instead: this year's active Sunday School classes to place a rotation in
//   ?unassigned=true - instead: active async students with no rotation in the
//     academic year (academicYearId, or the active year), for the assign dialog
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)

    if (searchParams.get("classOptions") === "true") {
      if (!canManageSundaySchool(user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const classes = await prisma.sundaySchoolClass.findMany({
        where: { isActive: true, status: "ACTIVE", sundaySchoolYear: { status: "OPEN" } },
        select: { id: true, name: true, level: true },
        orderBy: [{ level: "asc" }, { name: "asc" }],
      })
      return NextResponse.json(classes)
    }

    if (searchParams.get("unassigned") === "true") {
      if (!canManageSundaySchool(user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      const yearId =
        searchParams.get("academicYearId") ||
        (await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } }))?.id
      if (!yearId) return NextResponse.json([])
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          isAsyncStudent: true,
          isActive: true,
          student: { sundaySchoolAssignments: { none: { academicYearId: yearId } } },
        },
        select: { student: { select: { id: true, name: true, email: true } } },
        orderBy: { student: { name: "asc" } },
      })
      return NextResponse.json(enrollments.map((e) => e.student))
    }

    const studentId = searchParams.get("studentId")
    const academicYearId = searchParams.get("academicYearId")
    const grade = searchParams.get("grade")
    const isActive = searchParams.get("isActive")

    const where: Record<string, unknown> = {}
    if (studentId) where.studentId = studentId
    if (academicYearId) where.academicYearId = academicYearId
    if (grade) where.grade = grade as SundaySchoolGrade
    if (isActive !== null && isActive !== undefined) where.isActive = isActive === "true"

    // Role-based filtering
    if (user.role === UserRole.STUDENT) {
      where.studentId = user.id
    } else if (user.role === UserRole.MENTOR) {
      const menteeIds = await getMentorStudentIds(user.id, user.role)
      if (menteeIds) {
        where.studentId = { in: menteeIds }
      }
    } else if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const assignments = await prisma.sundaySchoolAssignment.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        class: { select: { id: true, name: true } },
        assigner: {
          select: {
            id: true,
            name: true,
          },
        },
        logs: {
          orderBy: { weekNumber: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    // Progress for the list: weeks attended, and the rate over weeks so far
    return NextResponse.json(
      assignments.map((assignment) => ({
        ...assignment,
        presentCount: assignment.logs.filter((log) => log.status === "VERIFIED" || log.status === "MANUAL").length,
        totalLogged: assignment.logs.length,
        percentage: rotationAttendanceToDate(assignment)?.percentage ?? null,
      }))
    )
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch assignments" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}

// POST /api/sunday-school/assignments - Create a new assignment
// Body: { studentId, grade, academicYearId, totalWeeks?, startDate }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    if (!canManageSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { studentId, classId, academicYearId, totalWeeks, startDate } = body
    let { grade } = body

    // A class (preferred) sets the grade from its level; a bare grade still works.
    if (classId) {
      const ssClass = await prisma.sundaySchoolClass.findFirst({
        where: { id: classId, isActive: true },
        select: { level: true },
      })
      if (!ssClass) {
        return NextResponse.json({ error: "Sunday School class not found" }, { status: 400 })
      }
      grade = rotationGradeForClassLevel(ssClass.level)
    }

    if (!studentId || !grade || !academicYearId || !startDate) {
      return NextResponse.json(
        { error: "Missing required fields: studentId, classId, academicYearId, startDate" },
        { status: 400 }
      )
    }

    // Validate grade enum
    const validGrades = Object.values(SundaySchoolGrade)
    if (!validGrades.includes(grade as SundaySchoolGrade)) {
      return NextResponse.json(
        { error: `Invalid grade. Must be one of: ${validGrades.join(", ")}` },
        { status: 400 }
      )
    }

    // Validate totalWeeks range
    const weeks = totalWeeks || 6
    if (weeks < 1 || weeks > 52) {
      return NextResponse.json(
        { error: "totalWeeks must be between 1 and 52" },
        { status: 400 }
      )
    }

    // Validate startDate
    const parsedStartDate = new Date(startDate)
    if (isNaN(parsedStartDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid startDate format" },
        { status: 400 }
      )
    }

    // Validate student is async
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId },
    })

    if (!enrollment) {
      return NextResponse.json(
        { error: "Student enrollment not found" },
        { status: 404 }
      )
    }

    if (!enrollment.isAsyncStudent) {
      return NextResponse.json(
        { error: "Student is not marked as async. Only async students can have Sunday School assignments." },
        { status: 400 }
      )
    }

    // Check for existing assignment for this student + academic year
    const existing = await prisma.sundaySchoolAssignment.findUnique({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId,
        },
      },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Student already has an assignment for this academic year" },
        { status: 409 }
      )
    }

    // Normalize startDate to midnight
    parsedStartDate.setUTCHours(0, 0, 0, 0) // a date-only value is UTC midnight; keep that day

    const assignment = await prisma.sundaySchoolAssignment.create({
      data: {
        studentId,
        grade: grade as SundaySchoolGrade,
        classId: classId || null,
        academicYearId,
        yearLevel: enrollment.yearLevel as YearLevel,
        totalWeeks: weeks,
        startDate: parsedStartDate,
        assignedBy: user.id,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        class: { select: { id: true, name: true } },
        assigner: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(assignment, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create assignment" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}
