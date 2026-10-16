import { AttendanceStatus, LessonStatus, SundaySchoolLogStatus } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, scopeAllows } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { calculateAttendanceFromRecords, countAttendanceStatuses } from '@/lib/attendance-utils'
import { elapsedRotationWeeks, getAssignmentWeeks, GRADE_DISPLAY_NAMES } from '@/lib/sunday-school-utils'
import type { StudentHistory } from '@/lib/student-history'

// Prep records stay separate from Sunday School children, even for linked accounts.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const authorization = await getAuthorizationContext(user.id)
    if (authorization.disabled || !scopeAllows(authorization.prepStudentScope, id)) {
      throw new Error('Forbidden')
    }

    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId: id },
      select: {
        isAsyncStudent: true, yearLevel: true, notes: true,
        student: { select: { id: true, name: true } },
      },
    })
    // Approved accounts may appear in the student list before enrollment.
    const student = enrollment?.student ?? await prisma.user.findFirst({
      where: { id, role: 'STUDENT' }, select: { id: true, name: true },
    })
    if (!student) throw new Error('Not found')

    const notes = await prisma.studentNote.findMany({
      where: { studentId: id },
      select: { id: true, content: true, createdAt: true, author: { select: { name: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })

    let records: StudentHistory['attendance']['records']
    if (enrollment?.isAsyncStudent) {
      // Never query lesson attendance for a current async student. Only elapsed
      // rotation weeks count, with missing elapsed logs treated as absent.
      const assignments = await prisma.sundaySchoolAssignment.findMany({
        where: { studentId: id },
        select: {
          id: true, grade: true, startDate: true, totalWeeks: true,
          logs: { select: { weekNumber: true, status: true } },
        },
      })
      const now = new Date()
      records = assignments.flatMap(assignment => {
        const elapsed = elapsedRotationWeeks(assignment.startDate, assignment.totalWeeks, now)
        return getAssignmentWeeks(assignment.startDate, assignment.totalWeeks).slice(0, elapsed).map(week => {
          const status = assignment.logs.find(log => log.weekNumber === week.weekNumber)?.status
          return {
            id: `${assignment.id}:${week.weekNumber}`,
            date: week.weekOf.toISOString(),
            title: `${GRADE_DISPLAY_NAMES[assignment.grade]} · Week ${week.weekNumber}`,
            status: status === SundaySchoolLogStatus.EXCUSED ? AttendanceStatus.EXCUSED
              : status === SundaySchoolLogStatus.VERIFIED || status === SundaySchoolLogStatus.MANUAL
                ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT,
            notes: null, notApplicable: false, excluded: false,
          }
        })
      }).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
    } else {
      const attendance = await prisma.attendanceRecord.findMany({
        where: {
          studentId: id,
          lesson: { status: { in: [LessonStatus.SCHEDULED, LessonStatus.COMPLETED] } },
        },
        select: {
          id: true, status: true, notes: true, notEnrolledYet: true, expectedAbsenceNA: true,
          lesson: { select: { title: true, scheduledDate: true, isExamDay: true, academicYear: { select: { name: true } } } },
        },
        orderBy: [{ lesson: { scheduledDate: 'desc' } }, { id: 'desc' }],
      })
      records = attendance.map(record => ({
        id: record.id, date: record.lesson.scheduledDate.toISOString(),
        title: `${record.lesson.title} · ${record.lesson.academicYear.name}`,
        status: record.status, notes: record.notes,
        notApplicable: record.notEnrolledYet || record.expectedAbsenceNA,
        excluded: record.lesson.isExamDay,
      }))
    }
    const counted = records.filter(record => !record.excluded && !record.notApplicable)
    const result: StudentHistory = {
      ...student, program: 'prep',
      subtitle: `Servants Prep · ${!enrollment ? 'Not enrolled' : enrollment.isAsyncStudent ? 'Async' : enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}`,
      attendance: {
        kind: enrollment?.isAsyncStudent ? 'rotations' : 'lessons',
        records, counts: countAttendanceStatuses(counted), rate: calculateAttendanceFromRecords(counted),
      },
      notes: {
        general: enrollment?.notes ?? null,
        entries: notes.map(note => ({ ...note, createdAt: note.createdAt.toISOString() })),
      },
      visitations: null, phoneCalls: [],
    }
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
