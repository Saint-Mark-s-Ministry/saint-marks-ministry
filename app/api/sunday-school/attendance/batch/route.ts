import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canServeClass, getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { AttendanceStatus } from "@prisma/client"
import { isSessionDateToday } from "@/lib/sunday-school-class"

// Sunday School mode: save a whole class's child attendance for one session.
// Modeled on /api/attendance/batch, minus the prep-only concerns (conduct
// removals, expected absences, late-start excusals).

interface ChildAttendanceRecord {
  childId: string
  status: AttendanceStatus
  notes?: string | null
}

interface BatchRequest {
  sessionId: string
  records: ChildAttendanceRecord[]
}

const SUNDAY_SCHOOL_ATTENDANCE_STATUSES = new Set<AttendanceStatus>([
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
  AttendanceStatus.ABSENT,
])

// POST /api/sunday-school/attendance/batch
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    const body: BatchRequest = await request.json()
    const { sessionId, records } = body

    if (!sessionId || !records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "Missing sessionId or records array" },
        { status: 400 }
      )
    }

    const session = await prisma.sundaySchoolSession.findUnique({
      where: { id: sessionId },
      select: { id: true, classId: true, date: true, class: { select: { academicYearId: true } } },
    })
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }
    // Serving this class is what grants this — PRIEST reads but never writes
    const access = await getSundaySchoolAccess(user, session.class.academicYearId)
    if (!canServeClass(access, session.classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if (!isSessionDateToday(session.date)) {
      return NextResponse.json(
        { error: "Attendance can only be recorded on the session date" },
        { status: 400 }
      )
    }

    for (const record of records) {
      if (!record.childId) {
        return NextResponse.json({ error: "Each record needs a childId" }, { status: 400 })
      }
      if (!SUNDAY_SCHOOL_ATTENDANCE_STATUSES.has(record.status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${Array.from(SUNDAY_SCHOOL_ATTENDANCE_STATUSES).join(", ")}` },
          { status: 400 }
        )
      }
    }

    // Children must actually belong to this session's class
    const childIds = records.map(r => r.childId)
    const childrenInClass = await prisma.sundaySchoolChild.findMany({
      where: { id: { in: childIds }, classId: session.classId },
      select: { id: true },
    })
    if (childrenInClass.length !== new Set(childIds).size) {
      return NextResponse.json(
        { error: "One or more children are not on this class's roster" },
        { status: 400 }
      )
    }

    const existingRecords = await prisma.sundaySchoolChildAttendance.findMany({
      where: { sessionId },
      select: { id: true, childId: true },
    })
    const existingByChild = new Map(existingRecords.map(r => [r.childId, r.id]))

    const toCreate = records
      .filter(r => !existingByChild.has(r.childId))
      .map(r => ({
        sessionId,
        childId: r.childId,
        status: r.status,
        notes: r.notes?.trim() || null,
        recordedBy: user.id,
      }))

    const toUpdate = records
      .filter(r => existingByChild.has(r.childId))
      .map(r => ({
        id: existingByChild.get(r.childId)!,
        status: r.status,
        notes: r.notes?.trim() || null,
      }))

    await prisma.$transaction(async (tx) => {
      if (toCreate.length > 0) {
        await tx.sundaySchoolChildAttendance.createMany({ data: toCreate })
      }

      // Group status-only updates (the common case) into one query per status
      const statusGroups = new Map<AttendanceStatus, string[]>()
      const noteUpdates: typeof toUpdate = []

      for (const update of toUpdate) {
        if (update.notes === null) {
          const group = statusGroups.get(update.status) ?? []
          group.push(update.id)
          statusGroups.set(update.status, group)
        } else {
          noteUpdates.push(update)
        }
      }

      for (const [status, ids] of statusGroups) {
        await tx.sundaySchoolChildAttendance.updateMany({
          where: { id: { in: ids } },
          data: { status, notes: null, recordedBy: user.id },
        })
      }

      for (const update of noteUpdates) {
        await tx.sundaySchoolChildAttendance.update({
          where: { id: update.id },
          data: { status: update.status, notes: update.notes, recordedBy: user.id },
        })
      }

      // Record who last took attendance for this session
      await tx.sundaySchoolSession.update({
        where: { id: sessionId },
        data: { takenBy: user.id },
      })
    })

    return NextResponse.json({
      success: true,
      created: toCreate.length,
      updated: toUpdate.length,
    })
  } catch (error: unknown) {
    console.error("Sunday School batch attendance save error:", error)
    return handleApiError(error)
  }
}
