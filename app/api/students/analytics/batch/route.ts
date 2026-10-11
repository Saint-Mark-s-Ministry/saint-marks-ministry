import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canViewStudents } from "@/lib/roles"
import { LessonStatus, UserRole } from "@prisma/client"
import { handleApiError } from "@/lib/api-utils"
import {
  calculateAttendancePercentage,
  meetsAttendanceRequirement,
  isGraduationEligible,
  excludeAsyncPeriodRecords,
  type AttendanceCounts
} from "@/lib/attendance-utils"
import { rotationAttendanceToDate, rotationRequirementMet } from "@/lib/sunday-school-utils"

// GET /api/students/analytics/batch - Get analytics for all students efficiently
// OPTIMIZED: Uses database aggregations instead of fetching all records
// NOTE: academicYearId parameter is optional. If not provided, aggregates across ALL academic years.
// Supports studentIds parameter to filter to specific students (used by mentors)
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    // Admins and mentors can view analytics (mentors only for their assigned students)
    if (!canViewStudents(user.role as UserRole)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const academicYearId = searchParams.get('academicYearId')
    const studentIdsParam = searchParams.get('studentIds')

    // academicYearId is now optional - if not provided, aggregate across all years

    // Build enrollment filter - if studentIds provided, filter to those; otherwise get all active
    const enrollmentFilter: { isActive: boolean; studentId?: { in: string[] } } = {
      isActive: true
    }

    // Mentors can only view their own mentees' analytics. Resolve the mentee
    // set up-front and use it as a hard floor on filtering, so the route never
    // returns analytics for non-mentees - whether or not the caller passed
    // studentIds.
    let mentorMenteeIds: Set<string> | null = null
    if (user.role === UserRole.MENTOR) {
      const menteeEnrollments = await prisma.studentEnrollment.findMany({
        where: { mentorId: user.id, isActive: true },
        select: { studentId: true }
      })
      mentorMenteeIds = new Set(menteeEnrollments.map(e => e.studentId))

      if (studentIdsParam) {
        const requestedIds = studentIdsParam.split(',').filter(id => id.trim())
        const unauthorized = requestedIds.filter(id => !mentorMenteeIds!.has(id))
        if (unauthorized.length > 0) {
          return NextResponse.json(
            { error: "Forbidden" },
            { status: 403 }
          )
        }
      }
    }

    if (studentIdsParam) {
      const requestedStudentIds = studentIdsParam.split(',').filter(id => id.trim())
      if (requestedStudentIds.length > 0) {
        enrollmentFilter.studentId = { in: requestedStudentIds }
      }
    } else if (mentorMenteeIds) {
      // No studentIds provided AND caller is a MENTOR: scope to their mentees.
      enrollmentFilter.studentId = { in: Array.from(mentorMenteeIds) }
    }

    // Get enrollments with student IDs (minimal data)
    const enrollments = await prisma.studentEnrollment.findMany({
      where: enrollmentFilter,
      select: {
        studentId: true,
        yearLevel: true,
        isAsyncStudent: true,
        asyncApprovedAt: true,
        student: {
          select: {
            id: true,
            name: true
          }
        }
      }
    })

    const studentIds = enrollments.map(e => e.studentId)
    // Async students: lessons from the day they went async count only if a slip covered them
    const asyncExclusion = excludeAsyncPeriodRecords(enrollments)

    // Build lesson filter - if academicYearId provided, filter by it; otherwise include all
    // Only count lessons that have attendance records (i.e., attendance was taken)
    // Exclude exam day lessons and cancelled lessons from attendance calculations
    const lessonFilter = academicYearId
      ? { academicYearId, isExamDay: false, status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] } }
      : { isExamDay: false, status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] } }

    // Filter for lessons with attendance records (excludes exam days)
    const lessonsWithAttendanceFilter = {
      ...lessonFilter,
      attendanceRecords: { some: {} }
    }

    // Build exam filter - if academicYearId provided, filter by it; otherwise include all
    const examFilter = academicYearId
      ? { exam: { academicYearId } }
      : {}

    // Get academic years for reference (oldest first)
    const academicYears = await prisma.academicYear.findMany({
      orderBy: { startDate: 'asc' },
      select: { id: true, isActive: true }
    })

    // Current year = the active year (or the latest if none is active);
    // previous year = the one before it by start date
    const activeIndex = academicYears.findIndex(ay => ay.isActive)
    const currentIndex = activeIndex >= 0 ? activeIndex : academicYears.length - 1
    const currentYearId = academicYears[currentIndex]?.id
    const previousYearId = academicYears[currentIndex - 1]?.id

    // Year mapping is PER-STUDENT based on their current year level:
    // - Year 2 students: Year 1 = previous year, Year 2 = current year
    // - Year 1 students: Year 1 = current year, Year 2 = N/A (not started yet)
    const getStudentYearMapping = (studentYearLevel: string) => {
      if (studentYearLevel === 'YEAR_2') {
        return {
          year1AcademicYearId: previousYearId,
          year2AcademicYearId: currentYearId
        }
      } else {
        return {
          year1AcademicYearId: currentYearId,
          year2AcademicYearId: null // Not in Year 2 yet
        }
      }
    }

    // Get async student IDs for SS queries
    const asyncStudentIds = enrollments.filter(e => e.isAsyncStudent).map(e => e.studentId)

    // Run all queries in parallel for better performance
    const [lessonsWithAttendanceCount, attendanceAggregates, examAggregates, examScoresWithSections, attendanceWithYear, ssAssignments, conductRemovalCounts] = await Promise.all([
      // Count only lessons that have attendance records (completed lessons with attendance taken)
      prisma.lesson.count({
        where: lessonsWithAttendanceFilter
      }),

      // Get attendance counts grouped by student and status
      // Much more efficient than fetching all records and filtering in JS
      prisma.attendanceRecord.groupBy({
        by: ['studentId', 'status'],
        where: {
          studentId: { in: studentIds },
          lesson: lessonsWithAttendanceFilter,
          ...asyncExclusion,
        },
        _count: { status: true }
      }),

      // Get exam score averages per student using DB aggregation
      prisma.examScore.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          ...examFilter
        },
        _avg: { percentage: true },
        _count: { id: true }
      }),

      // Get exam scores with section info for section-level averages
      prisma.examScore.findMany({
        where: {
          studentId: { in: studentIds },
          ...examFilter
        },
        select: {
          studentId: true,
          percentage: true,
          exam: {
            select: {
              examSection: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }),

      // Get attendance with academic year info for year-based breakdown
      prisma.attendanceRecord.findMany({
        where: {
          studentId: { in: studentIds },
          lesson: lessonsWithAttendanceFilter,
          ...asyncExclusion,
        },
        select: {
          studentId: true,
          status: true,
          lesson: {
            select: {
              academicYearId: true
            }
          }
        }
      }),

      // Get Sunday School assignments with logs for async students
      asyncStudentIds.length > 0
        ? prisma.sundaySchoolAssignment.findMany({
            where: { studentId: { in: asyncStudentIds } },
            include: { logs: { select: { status: true, weekNumber: true } } }
          })
        : Promise.resolve([]),

      // Count conduct removals per student
      prisma.attendanceRecord.groupBy({
        by: ['studentId'],
        where: {
          studentId: { in: studentIds },
          conductRemoval: true,
        },
        _count: { id: true }
      })
    ])

    // Build lookup maps for O(1) access
    const attendanceByStudent = new Map<string, { present: number; late: number; absent: number; excused: number }>()
    for (const agg of attendanceAggregates) {
      if (!attendanceByStudent.has(agg.studentId)) {
        attendanceByStudent.set(agg.studentId, { present: 0, late: 0, absent: 0, excused: 0 })
      }
      const record = attendanceByStudent.get(agg.studentId)!
      if (agg.status === 'PRESENT') record.present = agg._count.status
      else if (agg.status === 'LATE') record.late = agg._count.status
      else if (agg.status === 'ABSENT') record.absent = agg._count.status
      else if ((agg.status as string) === 'EXCUSED') record.excused = agg._count.status
    }

    const examsByStudent = new Map<string, { avg: number; count: number }>()
    for (const agg of examAggregates) {
      examsByStudent.set(agg.studentId, {
        avg: agg._avg.percentage || 0,
        count: agg._count.id
      })
    }

    // Build section averages per student
    const sectionScoresByStudent = new Map<string, Map<string, number[]>>()
    for (const score of examScoresWithSections) {
      if (!sectionScoresByStudent.has(score.studentId)) {
        sectionScoresByStudent.set(score.studentId, new Map())
      }
      const studentSections = sectionScoresByStudent.get(score.studentId)!
      const sectionName = score.exam.examSection.name
      if (!studentSections.has(sectionName)) {
        studentSections.set(sectionName, [])
      }
      studentSections.get(sectionName)!.push(score.percentage)
    }

    // Build attendance by student by academic year (raw data, will be mapped per-student later)
    const attendanceByStudentByAcademicYear = new Map<string, Map<string, { present: number; late: number; absent: number; excused: number }>>()
    for (const record of attendanceWithYear) {
      if (!attendanceByStudentByAcademicYear.has(record.studentId)) {
        attendanceByStudentByAcademicYear.set(record.studentId, new Map())
      }
      const studentYearMap = attendanceByStudentByAcademicYear.get(record.studentId)!
      const academicYearId = record.lesson.academicYearId

      if (!studentYearMap.has(academicYearId)) {
        studentYearMap.set(academicYearId, { present: 0, late: 0, absent: 0, excused: 0 })
      }
      const yearRecord = studentYearMap.get(academicYearId)!

      if (record.status === 'PRESENT') yearRecord.present++
      else if (record.status === 'LATE') yearRecord.late++
      else if (record.status === 'ABSENT') yearRecord.absent++
      else if ((record.status as string) === 'EXCUSED') yearRecord.excused++
    }

    // Build SS assignment lookup per student
    type SSAssignment = { studentId: string; yearLevel: string; isActive: boolean; startDate: Date; totalWeeks: number; logs: { status: import('@prisma/client').SundaySchoolLogStatus; weekNumber: number }[] }
    const ssAssignmentsByStudent = new Map<string, SSAssignment[]>()
    for (const assignment of ssAssignments as SSAssignment[]) {
      if (!ssAssignmentsByStudent.has(assignment.studentId)) {
        ssAssignmentsByStudent.set(assignment.studentId, [])
      }
      ssAssignmentsByStudent.get(assignment.studentId)!.push(assignment)
    }

    // Build conduct removal counts per student
    const conductRemovalByStudent = new Map<string, number>()
    for (const agg of conductRemovalCounts) {
      conductRemovalByStudent.set(agg.studentId, agg._count.id)
    }

    // Calculate stats for each student using pre-aggregated data
    const studentAnalytics = enrollments.map(enrollment => {
      const studentId = enrollment.studentId
      const attendance = attendanceByStudent.get(studentId) || { present: 0, late: 0, absent: 0, excused: 0 }
      const exams = examsByStudent.get(studentId) || { avg: 0, count: 0 }

      // Get per-student year mapping based on their current year level
      const studentYearMapping = getStudentYearMapping(enrollment.yearLevel)
      const studentAcademicYearAttendance = attendanceByStudentByAcademicYear.get(studentId)

      // Get Year 1 attendance for this student
      const year1AcademicYearId = studentYearMapping.year1AcademicYearId
      const year1Attendance = year1AcademicYearId && studentAcademicYearAttendance
        ? studentAcademicYearAttendance.get(year1AcademicYearId) || { present: 0, late: 0, absent: 0, excused: 0 }
        : { present: 0, late: 0, absent: 0, excused: 0 }

      // Get Year 2 attendance for this student (null if not in Year 2 yet)
      const year2AcademicYearId = studentYearMapping.year2AcademicYearId
      const year2Attendance = year2AcademicYearId && studentAcademicYearAttendance
        ? studentAcademicYearAttendance.get(year2AcademicYearId) || { present: 0, late: 0, absent: 0, excused: 0 }
        : null // null means not in Year 2 yet

      // Calculate attendance using shared utility
      // EXCUSED lessons don't count against or for the student
      const { present: presentCount, late: lateCount, absent: absentCount, excused: excusedCount } = attendance

      // Overall attendance calculation using shared utility
      // Uses STUDENT'S attendance record count, not ALL lessons in the system
      const overallAttendancePercentage = calculateAttendancePercentage(attendance as AttendanceCounts)
      const studentTotalLessons = presentCount + lateCount + absentCount + excusedCount
      const totalEffectivePresent = presentCount + (lateCount / 2)
      const effectiveTotalLessons = studentTotalLessons - excusedCount

      // Year 1 attendance - use shared utility
      const year1AttendancePercentage = calculateAttendancePercentage(year1Attendance as AttendanceCounts)
      const year1StudentTotalLessons = year1Attendance.present + year1Attendance.late + year1Attendance.absent + year1Attendance.excused
      const year1EffectivePresent = year1Attendance.present + (year1Attendance.late / 2)
      const year1EffectiveTotalLessons = year1StudentTotalLessons - year1Attendance.excused

      // Year 2 attendance (null if student is still in Year 1) - use shared utility
      const year2AttendancePercentage = year2Attendance
        ? calculateAttendancePercentage(year2Attendance as AttendanceCounts)
        : null
      const year2StudentTotalLessons = year2Attendance
        ? year2Attendance.present + year2Attendance.late + year2Attendance.absent + year2Attendance.excused
        : 0
      const year2EffectivePresent = year2Attendance
        ? year2Attendance.present + (year2Attendance.late / 2)
        : 0
      const year2EffectiveTotalLessons = year2Attendance
        ? year2StudentTotalLessons - year2Attendance.excused
        : 0

      // Calculate section averages for this student
      const studentSections = sectionScoresByStudent.get(studentId)
      const sectionAverages: { [section: string]: number } = {}
      let allSectionsMet = true

      if (studentSections) {
        for (const [sectionName, scores] of studentSections.entries()) {
          const avg = scores.reduce((a, b) => a + b, 0) / scores.length
          sectionAverages[sectionName] = avg  // No rounding - keep exact score
          if (avg < 60) allSectionsMet = false
        }
      }

      // Graduation requirements using shared utility
      // If no data yet, treat as "met" (not penalized) until data exists
      const attendanceMet = overallAttendancePercentage === null ? true : meetsAttendanceRequirement(overallAttendancePercentage)
      // If no exam scores, return null for average (don't penalize for exams not taken yet)
      const examAverage = exams.count > 0 ? exams.avg : null
      const examAverageMet = examAverage === null ? true : examAverage >= 75
      // allSectionsMet is already true by default, only set to false if a section < 60%

      // Sunday School check for async students
      // (same rules as /api/students/[id]/analytics: weeks still ahead don't count,
      // and the current year needs a rotation)
      let sundaySchoolMet = true
      let rotationPercentage: number | null = null
      if (enrollment.isAsyncStudent) {
        const rotations = (ssAssignmentsByStudent.get(studentId) || []).map((ssa) => ({
          yearLevel: ssa.yearLevel,
          isActive: ssa.isActive,
          attendance: rotationAttendanceToDate(ssa),
        }))
        sundaySchoolMet = rotationRequirementMet(rotations, enrollment.yearLevel).met
        rotationPercentage = rotations.find((r) => r.isActive && r.yearLevel === enrollment.yearLevel)?.attendance?.percentage ?? null
      }

      const graduationEligible = isGraduationEligible({
        // An async student's rotation is their attendance evidence
        attendancePercentage: overallAttendancePercentage ?? rotationPercentage,
        examAverage,
        requirementsMet: [attendanceMet, examAverageMet, allSectionsMet, sundaySchoolMet],
      })

      return {
        studentId,
        studentName: enrollment.student.name,
        yearLevel: enrollment.yearLevel,
        // Attendance - null if no lessons yet
        attendancePercentage: overallAttendancePercentage !== null
          ? Math.round(overallAttendancePercentage * 10) / 10
          : null,
        attendanceMet,
        totalLessons: effectiveTotalLessons, // Total minus excused for this student
        allLessons: lessonsWithAttendanceCount, // All lessons with attendance
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        attendedLessons: Math.round(totalEffectivePresent * 10) / 10,
        // Exams - null if no exams yet (no rounding - keep exact scores)
        examAverage: examAverage,
        avgExamScore: exams.count > 0 ? exams.avg : null,
        examAverageMet,
        examCount: exams.count,
        sectionAverages,
        allSectionsMet,
        // Graduation
        graduationEligible,
        // Year-based (for admin page) - based on student's enrollment year
        // Year 1 students: Year 1 = current year, Year 2 = null (not started)
        // Year 2 students: Year 1 = last year, Year 2 = current year
        // Note: Uses STUDENT'S attendance record count, not all lessons in the system
        year1AttendancePercentage: year1AttendancePercentage !== null
          ? Math.round(year1AttendancePercentage * 10) / 10
          : null,
        year2AttendancePercentage: year2AttendancePercentage !== null
          ? Math.round(year2AttendancePercentage * 10) / 10
          : null,
        year1TotalLessons: year1EffectiveTotalLessons, // Student's Year 1 lessons minus excused
        year2TotalLessons: year2Attendance !== null ? year2EffectiveTotalLessons : null, // Student's Year 2 lessons minus excused
        year1AttendedLessons: Math.round(year1EffectivePresent * 10) / 10,
        year2AttendedLessons: year2Attendance !== null
          ? Math.round(year2EffectivePresent * 10) / 10
          : null,
        // Conduct removals count
        conductDismissalCount: conductRemovalByStudent.get(studentId) || 0,
        // Async student fields
        isAsyncStudent: enrollment.isAsyncStudent,
        ...(enrollment.isAsyncStudent ? { sundaySchoolMet } : {})
      }
    })

    return NextResponse.json(studentAnalytics)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
