import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { SlipType, UserRole } from "@prisma/client"
import { canViewStudents } from "@/lib/roles"
import { handleApiError } from "@/lib/api-utils"
import { buildConfessionPeriodViews } from "@/lib/confession"

// GET /api/students/[id]/confession - Confession-period status for one student in the active academic year.
// Students see only their own; mentors only their own mentees; admins any student.
// Returns statuses and upload dates only, never the slip image URL.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: studentId } = await params

    if (user.role === UserRole.STUDENT && user.id !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (user.role !== UserRole.STUDENT && !canViewStudents(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId },
      select: {
        mentorId: true,
        attendanceStartDate: true,
        enrolledAt: true,
        academicYear: { select: { startDate: true } },
      },
    })
    if (user.role === UserRole.MENTOR && enrollment?.mentorId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!enrollment) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 })
    }

    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, startDate: true, endDate: true },
    })
    if (!activeYear) {
      return NextResponse.json({ academicYear: null, periods: [] })
    }

    const slips = await prisma.studentSlip.findMany({
      where: { studentId, type: SlipType.CONFESSION },
      select: { periodStart: true, createdAt: true },
    })

    return NextResponse.json({
      academicYear: { id: activeYear.id, name: activeYear.name },
      periods: buildConfessionPeriodViews(activeYear, enrollment, slips),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
