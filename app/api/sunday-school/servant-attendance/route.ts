import { NextResponse } from "next/server"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import {
  canTakeServantAttendance,
  canViewServantAttendance,
  getSundaySchoolAccess,
} from "@/lib/sunday-school-access"
import { isSessionDateToday, normalizeSessionDate } from "@/lib/sunday-school-class"

// GET /api/sunday-school/servant-attendance?classId=xxx&date=YYYY-MM-DD
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const date = searchParams.get("date")

    if (!classId || !date) {
      return NextResponse.json({ error: "classId and date are required" }, { status: 400 })
    }

    let sessionDate: Date
    try {
      sessionDate = normalizeSessionDate(date)
    } catch {
      return NextResponse.json({ error: "Invalid session date" }, { status: 400 })
    }

    if (sessionDate > normalizeSessionDate(new Date())) {
      return NextResponse.json({ error: "Cannot load a future date" }, { status: 400 })
    }

    const sundaySchoolClass = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: { id: true, name: true, level: true, academicYearId: true },
    })
    if (!sundaySchoolClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, sundaySchoolClass.academicYearId)
    if (!canViewServantAttendance(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const session = await prisma.sundaySchoolSession.findUnique({
      where: { classId_date: { classId, date: sessionDate } },
      select: { id: true, classId: true, date: true, topic: true, notes: true, takenBy: true },
    })

    const [assignments, records] = await Promise.all([
      prisma.sundaySchoolServantAssignment.findMany({
        where: {
          classId,
          academicYearId: sundaySchoolClass.academicYearId,
          endedAt: null,
          user: { isDisabled: false },
        },
        select: {
          userId: true,
          authority: true,
          user: {
            select: { id: true, name: true, email: true, profileImageUrl: true },
          },
        },
        orderBy: { user: { name: "asc" } },
      }),
      session
        ? prisma.sundaySchoolServantAttendance.findMany({
            where: { sessionId: session.id },
            select: { id: true, servantId: true, status: true },
          })
        : Promise.resolve([]),
    ])

    const attendanceByServant = new Map(records.map(record => [record.servantId, record]))
    const roster = Array.from(
      new Map(assignments.map(assignment => [assignment.userId, assignment])).values()
    ).map(assignment => ({
      ...assignment.user,
      userId: assignment.userId,
      authority: assignment.authority,
      attendance: attendanceByServant.get(assignment.userId) ?? null,
    }))

    return NextResponse.json({
      class: sundaySchoolClass,
      session,
      roster,
      canEdit: canTakeServantAttendance(access, classId) && isSessionDateToday(sessionDate),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
