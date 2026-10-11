import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canManageData } from "@/lib/roles"
import { AttendanceStatus } from "@prisma/client"
import { parseTimeString, handleApiError } from "@/lib/api-utils"
import { notifyAttendanceRecorded, notifyConductRemoval } from "@/lib/notifications"
import { asyncPeriodStart, isAsyncPeriodLesson } from "@/lib/attendance-utils"

interface AttendanceRecord {
  studentId: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  arrivedAt?: string | null
  notes?: string | null
  conductRemoval?: boolean
  conductNote?: string | null
}

interface BatchRequest {
  lessonId: string
  records: AttendanceRecord[]
}

// POST /api/attendance/batch - Save multiple attendance records in one request
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // PRIEST is read-only, only SUPER_ADMIN and SERVANT_PREP can manage attendance
    if (!canManageData(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body: BatchRequest = await request.json()
    const { lessonId } = body
    let { records } = body

    if (!lessonId || !records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: "Missing lessonId or records array" },
        { status: 400 }
      )
    }

    // Verify lesson exists
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId }
    })

    if (!lesson) {
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      )
    }

    // Prevent editing attendance for future lessons
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const lessonDate = new Date(lesson.scheduledDate)
    lessonDate.setHours(0, 0, 0, 0)
    if (lessonDate > today) {
      return NextResponse.json(
        { error: "Cannot edit attendance before the lesson date" },
        { status: 400 }
      )
    }

    // Get existing attendance records for this lesson
    const existingRecords = await prisma.attendanceRecord.findMany({
      where: { lessonId },
      select: { id: true, studentId: true }
    })

    const existingByStudent = new Map(
      existingRecords.map(r => [r.studentId, r.id])
    )

    const studentIdSet = records.map(r => r.studentId)

    // Late-start: students whose attendance start date is after this lesson's
    // date should have this lesson auto-excused as "joined later".
    const lessonDateValue = new Date(lesson.scheduledDate)
    const enrollmentsForStudents = await prisma.studentEnrollment.findMany({
      where: { studentId: { in: studentIdSet } },
      select: { studentId: true, attendanceStartDate: true, isAsyncStudent: true, asyncApprovedAt: true },
    })

    // Async students aren't on the roll call for lessons from the day they went
    // async (their attendance is their Sunday School rotation); ignore any record
    // sent for them so a stale page can't mark them absent. Slips still apply.
    const asyncForLesson = new Set(
      enrollmentsForStudents
        .filter(e => isAsyncPeriodLesson(lesson.scheduledDate, asyncPeriodStart(e)))
        .map(e => e.studentId)
    )
    records = records.filter(r => !asyncForLesson.has(r.studentId))
    const attendanceStartByStudent = new Map<string, Date | null>(
      enrollmentsForStudents.map(e => [e.studentId, e.attendanceStartDate])
    )

    // Expected absences covering this lesson's date, per student
    const coveringAbsences = await prisma.expectedAbsence.findMany({
      where: {
        studentId: { in: studentIdSet },
        startDate: { lte: lesson.scheduledDate },
        endDate: { gte: lesson.scheduledDate },
      },
      select: { id: true, studentId: true, reason: true, markAsNA: true },
    })
    const absenceByStudent = new Map(coveringAbsences.map(a => [a.studentId, a]))

    // Validate conduct removals: must have a non-empty note
    for (const record of records) {
      if (record.conductRemoval === true && (!record.conductNote || !record.conductNote.trim())) {
        return NextResponse.json(
          { error: `A reason is required when removing a student from a lesson` },
          { status: 400 }
        )
      }
    }

    // Separate into creates and updates
    const toCreate: Array<{
      lessonId: string
      studentId: string
      status: AttendanceStatus
      arrivedAt: Date | null
      notes: string | null
      recordedBy: string
      conductRemoval: boolean
      conductNote: string | null
      notEnrolledYet: boolean
      expectedAbsenceId: string | null
      expectedAbsenceNA: boolean
    }> = []

    const toUpdate: Array<{
      id: string
      status: AttendanceStatus
      arrivedAt: Date | null
      notes: string | null
      conductRemoval: boolean
      conductNote: string | null
      notEnrolledYet: boolean
      expectedAbsenceId: string | null
      expectedAbsenceNA: boolean
    }> = []

    for (const record of records) {
      const existingId = existingByStudent.get(record.studentId)
      // Parse arrivedAt using utility function
      const arrivedAt = parseTimeString(record.arrivedAt)
      const conductRemoval = record.conductRemoval === true
      const conductNote = conductRemoval ? (record.conductNote || null) : null

      let status: AttendanceStatus = record.status as AttendanceStatus
      let notes = record.notes || null
      let notEnrolledYet = false
      let expectedAbsenceId: string | null = null
      let expectedAbsenceNA = false

      if (!conductRemoval) {
        const startDate = attendanceStartByStudent.get(record.studentId)
        const absence = absenceByStudent.get(record.studentId)
        if (
          startDate &&
          lessonDateValue < startDate &&
          (status === AttendanceStatus.ABSENT || status === AttendanceStatus.EXCUSED)
        ) {
          // Lesson predates the student's start date — auto-excuse (N/A), not counted.
          // Present/Late are left untouched so an explicit attendance is respected;
          // re-saving an already-N/A (EXCUSED) record keeps the flag.
          status = AttendanceStatus.EXCUSED
          notEnrolledYet = true
        } else if (
          absence &&
          (status === AttendanceStatus.ABSENT || status === AttendanceStatus.EXCUSED)
        ) {
          // Covered by a planned/expected absence — link it and carry the reason.
          // Absent stays Absent (counts against the rate) until manually excused.
          // Excused under an N/A absence is shown as N/A and excluded from the rate.
          expectedAbsenceId = absence.id
          expectedAbsenceNA = absence.markAsNA && status === AttendanceStatus.EXCUSED
          if (!notes) notes = absence.reason
        }
      }

      if (existingId) {
        toUpdate.push({
          id: existingId,
          status,
          arrivedAt,
          notes,
          conductRemoval,
          conductNote,
          notEnrolledYet,
          expectedAbsenceId,
          expectedAbsenceNA,
        })
      } else {
        toCreate.push({
          lessonId,
          studentId: record.studentId,
          status,
          arrivedAt,
          notes,
          recordedBy: user.id,
          conductRemoval,
          conductNote,
          notEnrolledYet,
          expectedAbsenceId,
          expectedAbsenceNA,
        })
      }
    }

    // Execute batch operations in a transaction
    await prisma.$transaction(async (tx) => {
      // Batch create new records
      if (toCreate.length > 0) {
        await tx.attendanceRecord.createMany({
          data: toCreate
        })
      }

      // Batch update existing records
      if (toUpdate.length > 0) {
        // Group simple status-only updates (no arrivedAt, notes, or conductRemoval)
        const updateGroups = new Map<string, typeof toUpdate>()
        const complexUpdates: typeof toUpdate = []

        for (const update of toUpdate) {
          if (
            update.arrivedAt === null &&
            update.notes === null &&
            !update.conductRemoval &&
            !update.notEnrolledYet &&
            !update.expectedAbsenceId
          ) {
            // Simple status-only updates can be grouped
            if (!updateGroups.has(update.status)) {
              updateGroups.set(update.status, [])
            }
            updateGroups.get(update.status)!.push(update)
          } else {
            // Complex updates need individual handling
            complexUpdates.push(update)
          }
        }

        // Execute grouped updates (clears conduct removal / absence flags when not flagged)
        for (const [status, groupedRecords] of updateGroups) {
          if (groupedRecords.length > 0) {
            await tx.attendanceRecord.updateMany({
              where: { id: { in: groupedRecords.map(r => r.id) } },
              data: { status: status as AttendanceStatus, conductRemoval: false, conductNote: null, notEnrolledYet: false, expectedAbsenceId: null, expectedAbsenceNA: false }
            })
          }
        }

        // Execute individual complex updates
        for (const update of complexUpdates) {
          await tx.attendanceRecord.update({
            where: { id: update.id },
            data: {
              status: update.status,
              arrivedAt: update.arrivedAt,
              notes: update.notes,
              conductRemoval: update.conductRemoval,
              conductNote: update.conductNote,
              notEnrolledYet: update.notEnrolledYet,
              expectedAbsenceId: update.expectedAbsenceId,
              expectedAbsenceNA: update.expectedAbsenceNA,
            }
          })
        }
      }
    })

    // Send notifications to mentors (non-blocking)
    const studentIds = records.map((r: AttendanceRecord) => r.studentId)
    const conductRemovals = records.filter((r: AttendanceRecord) => r.conductRemoval === true)
    prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, name: true },
    }).then(async (students) => {
      const studentRecords = records.map((r: AttendanceRecord) => ({
        studentId: r.studentId,
        studentName: students.find((s) => s.id === r.studentId)?.name || 'Student',
        status: r.status,
      }))
      const lessonDate = lesson.scheduledDate
        ? new Date(lesson.scheduledDate).toLocaleDateString()
        : 'N/A'
      await notifyAttendanceRecorded({
        lessonTitle: lesson.title,
        lessonDate,
        studentRecords,
      }).catch(() => {})

      // Notify mentors for each conduct removal (non-blocking)
      const removedByName = user.name || 'Admin'
      for (const removal of conductRemovals) {
        const studentName = students.find((s) => s.id === removal.studentId)?.name || 'Student'
        notifyConductRemoval({
          studentId: removal.studentId,
          studentName,
          lessonTitle: lesson.title,
          conductNote: removal.conductNote || '',
          removedByName,
        }).catch(() => {})
      }
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      created: toCreate.length,
      updated: toUpdate.length
    })
  } catch (error: unknown) {
    console.error('Batch attendance save error:', error)
    return handleApiError(error)
  }
}
