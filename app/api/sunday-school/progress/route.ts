import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { UserRole, YearLevel } from "@prisma/client"
import { isAdmin } from "@/lib/roles"
import { getMentorStudentIds } from "@/lib/api-utils"
import { getAssignmentWeeks, GRADE_DISPLAY_NAMES, rotationAttendanceToDate } from "@/lib/sunday-school-utils"

// GET /api/sunday-school/progress - Get student Sunday School progress
// Query params:
//   ?studentId=xxx - required, the student to get progress for
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get("studentId")

    if (!studentId) {
      return NextResponse.json(
        { error: "Missing required query parameter: studentId" },
        { status: 400 }
      )
    }

    // Role-based access control
    if (user.role === UserRole.STUDENT) {
      if (studentId !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    } else if (user.role === UserRole.MENTOR) {
      const menteeIds = await getMentorStudentIds(user.id, user.role)
      if (menteeIds && !menteeIds.includes(studentId)) {
        return NextResponse.json(
          { error: "Forbidden: Student is not your mentee" },
          { status: 403 }
        )
      }
    } else if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Fetch all assignments for this student with their logs
    const assignments = await prisma.sundaySchoolAssignment.findMany({
      where: { studentId },
      include: {
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        logs: {
          orderBy: { weekNumber: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    })

    // Build per-assignment progress data
    const assignmentProgress = assignments.map((assignment) => {
      // Weeks still ahead are not counted as missed
      const attendance = rotationAttendanceToDate(assignment)
      const weeks = getAssignmentWeeks(assignment.startDate, assignment.totalWeeks)

      // Map logs to weeks for week-by-week breakdown
      const logsByWeek = new Map(
        assignment.logs.map((log) => [log.weekNumber, log])
      )

      const weekBreakdown = weeks.map((week) => {
        const log = logsByWeek.get(week.weekNumber)
        return {
          weekNumber: week.weekNumber,
          weekOf: week.weekOf,
          status: log?.status || null,
          notes: log?.notes || null,
          studentNotes: log?.studentNotes || null,
          logId: log?.id || null,
        }
      })

      return {
        assignmentId: assignment.id,
        grade: assignment.grade,
        gradeDisplayName: GRADE_DISPLAY_NAMES[assignment.grade],
        yearLevel: assignment.yearLevel,
        academicYear: assignment.academicYear,
        totalWeeks: assignment.totalWeeks,
        startDate: assignment.startDate,
        isActive: assignment.isActive,
        attendance,
        weekBreakdown,
      }
    })

    // Determine graduation info
    const year1Assignment = assignmentProgress.find(
      (a) => a.yearLevel === YearLevel.YEAR_1
    )
    const year2Assignment = assignmentProgress.find(
      (a) => a.yearLevel === YearLevel.YEAR_2
    )

    const year1Met = year1Assignment?.attendance?.met ?? false
    const year2Met = year2Assignment?.attendance?.met ?? false
    const allMet = year1Met && year2Met

    return NextResponse.json({
      studentId,
      assignments: assignmentProgress,
      graduation: {
        year1Met,
        year2Met,
        allMet,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch progress" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}
