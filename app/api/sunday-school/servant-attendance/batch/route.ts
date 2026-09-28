import { NextResponse } from "next/server"
import { SundaySchoolServantAttendanceStatus } from "@prisma/client"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { canTakeServantAttendance, getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { isSessionDateToday, normalizeSessionDate } from "@/lib/sunday-school-class"

interface ServantAttendanceRecord {
  servantId: string
  status: SundaySchoolServantAttendanceStatus
}

interface BatchRequest {
  classId: string
  date: string
  records: ServantAttendanceRecord[]
}

// POST /api/sunday-school/servant-attendance/batch
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const body: BatchRequest = await request.json()
    const { classId, date, records } = body

    if (!classId || !date || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "classId, date, and records are required" },
        { status: 400 }
      )
    }
    if (records.length === 0) {
      return NextResponse.json({ error: "At least one attendance record is required" }, { status: 400 })
    }

    let sessionDate: Date
    try {
      sessionDate = normalizeSessionDate(date)
    } catch {
      return NextResponse.json({ error: "Invalid session date" }, { status: 400 })
    }

    const servantIds = records.map(record => record.servantId)
    if (new Set(servantIds).size !== servantIds.length) {
      return NextResponse.json({ error: "Each servant may only appear once" }, { status: 400 })
    }

    const validStatuses = Object.values(SundaySchoolServantAttendanceStatus)
    for (const record of records) {
      if (!record.servantId) {
        return NextResponse.json({ error: "Each record needs a servantId" }, { status: 400 })
      }
      if (!validStatuses.includes(record.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        )
      }
    }

    const sundaySchoolClass = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: { id: true, academicYearId: true },
    })
    if (!sundaySchoolClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, sundaySchoolClass.academicYearId)
    if (!canTakeServantAttendance(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!isSessionDateToday(sessionDate)) {
      return NextResponse.json(
        { error: "Attendance can only be recorded on the session date" },
        { status: 400 }
      )
    }

    const rosterAssignments = await prisma.sundaySchoolServantAssignment.findMany({
      where: {
        classId,
        academicYearId: sundaySchoolClass.academicYearId,
        userId: { in: servantIds },
        endedAt: null,
        user: { isDisabled: false },
      },
      select: { userId: true },
    })
    const rosterIds = new Set(rosterAssignments.map(assignment => assignment.userId))
    if (servantIds.some(servantId => !rosterIds.has(servantId))) {
      return NextResponse.json(
        { error: "One or more servants are not on this class's active roster" },
        { status: 400 }
      )
    }

    const result = await prisma.$transaction(async tx => {
      const session = await tx.sundaySchoolSession.upsert({
        where: { classId_date: { classId, date: sessionDate } },
        create: { classId, date: sessionDate },
        update: {},
        select: { id: true },
      })

      const existing = await tx.sundaySchoolServantAttendance.findMany({
        where: { sessionId: session.id, servantId: { in: servantIds } },
        select: { servantId: true },
      })
      const existingIds = new Set(existing.map(record => record.servantId))

      for (const record of records) {
        await tx.sundaySchoolServantAttendance.upsert({
          where: {
            sessionId_servantId: {
              sessionId: session.id,
              servantId: record.servantId,
            },
          },
          create: {
            sessionId: session.id,
            servantId: record.servantId,
            status: record.status,
            recordedBy: user.id,
          },
          update: { status: record.status, recordedBy: user.id },
        })
      }

      return {
        sessionId: session.id,
        created: records.filter(record => !existingIds.has(record.servantId)).length,
        updated: records.filter(record => existingIds.has(record.servantId)).length,
      }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
