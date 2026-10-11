import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { ExamYearLevel, LessonStatus, UserRole } from "@prisma/client"
import { canViewStudents } from "@/lib/roles"
import { handleApiError } from "@/lib/api-utils"
import {
  countAttendanceStatuses,
  calculateAttendancePercentage,
  meetsAttendanceRequirement,
  isGraduationEligible,
  excludeAsyncPeriodRecords,
} from "@/lib/attendance-utils"
import { getAssignmentWeeks, rotationAttendanceToDate, rotationRequirementMet } from "@/lib/sunday-school-utils"

// GET /api/students/[id]/analytics - Get student analytics including graduation status
// NOTE: academicYearId parameter is optional. If not provided, aggregates across ALL academic years.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: studentId } = await params

    // Students can only view their own analytics
    // Admins and mentors can view any student's analytics (mentor restriction handled elsewhere)
    if (user.role === UserRole.STUDENT && user.id !== studentId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // Non-students must have permission to view students
    if (user.role !== UserRole.STUDENT && !canViewStudents(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // Mentors can only view their own mentees' analytics
    if (user.role === UserRole.MENTOR) {
      const enrollment = await prisma.studentEnrollment.findUnique({
        where: { studentId },
        select: { mentorId: true }
      })
      if (!enrollment || enrollment.mentorId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden" },
          { status: 403 }
        )
      }
    }

    const { searchParams } = new URL(request.url)
    let academicYearId = searchParams.get('academicYearId')

    // Get enrollment
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: {
        studentId
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        mentor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          }
        },
        fatherOfConfession: {
          select: {
            id: true,
            name: true,
            phone: true,
            church: true,
          }
        }
      }
    })

    if (!enrollment) {
      return NextResponse.json(
        { error: "Enrollment not found" },
        { status: 404 }
      )
    }

    // For STUDENT users, apply year-level filtering logic:
    // - Year 1 students: Only see active academic year data
    // - Year 2 students: See all data (no filter)
    // Admins and mentors can optionally filter by academicYearId via query param
    if (user.role === UserRole.STUDENT && enrollment.yearLevel === 'YEAR_1') {
      const activeAcademicYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true }
      })
      if (activeAcademicYear) {
        academicYearId = activeAcademicYear.id
      }
    }

    // Build lesson filter - if academicYearId provided, filter by it; otherwise include all
    // Only count lessons that have attendance records (i.e., attendance was taken)
    // Exclude exam day lessons and cancelled lessons from attendance calculations
    const lessonFilter = academicYearId
      ? { academicYearId, isExamDay: false, status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] } }
      : { isExamDay: false, status: { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] } }

    // Get count of lessons that have attendance records (completed lessons with attendance taken)
    // Excludes exam day lessons
    const lessonsWithAttendance = await prisma.lesson.count({
      where: {
        ...lessonFilter,
        attendanceRecords: {
          some: {} // At least one attendance record exists
        }
      }
    })

    // Get attendance records - only fetch needed fields for performance
    // Excludes exam day lessons
    // Async students: lessons from the day they went async count only if a slip covered them
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        lesson: lessonFilter,
        ...excludeAsyncPeriodRecords([enrollment]),
      },
      select: {
        status: true,
        arrivedAt: true,
        conductRemoval: true,
        notEnrolledYet: true,
        expectedAbsenceNA: true,
        lesson: {
          select: {
            status: true
          }
        }
      }
    })

    // Records excused because the lesson predates the student's start date
    // (late start). These are shown as N/A rather than a regular excuse.
    const notEnrolledYetCount = attendanceRecords.filter(r => r.notEnrolledYet).length
    // Records marked N/A via an expected absence — also excluded from the rate.
    const expectedAbsenceNACount = attendanceRecords.filter(r => r.expectedAbsenceNA).length

    // Count conduct removals across all lessons (not filtered by academicYearId)
    const conductDismissalCount = await prisma.attendanceRecord.count({
      where: { studentId, conductRemoval: true }
    })

    // Calculate attendance using shared utility
    const attendanceCounts = countAttendanceStatuses(attendanceRecords)
    const { present: presentCount, late: lateCount, absent: absentCount, excused: excusedCount } = attendanceCounts

    // Calculate totals using shared utilities
    const studentTotalLessons = presentCount + lateCount + absentCount + excusedCount
    const effectivePresent = presentCount + (lateCount / 2)
    const effectiveTotalLessons = studentTotalLessons - excusedCount
    const attendancePercentage = calculateAttendancePercentage(attendanceCounts)
    // If no attendance data, treat as "met" (not penalized) until data exists
    const attendanceMet = attendancePercentage === null ? true : meetsAttendanceRequirement(attendancePercentage)

    // Build exam filter - if academicYearId provided, filter by it; otherwise include all
    // Map yearLevel to ExamYearLevel (BOTH is always included, plus the student's current year)
    // Year 2 students see exams for both years
    const validYearLevels: ExamYearLevel[] = enrollment.yearLevel === 'YEAR_2'
      ? [ExamYearLevel.BOTH, ExamYearLevel.YEAR_1, ExamYearLevel.YEAR_2]
      : [ExamYearLevel.BOTH, ExamYearLevel.YEAR_1]

    const examWhereClause = academicYearId
      ? {
          studentId,
          exam: {
            academicYearId,
            yearLevel: { in: validYearLevels }
          }
        }
      : {
          studentId,
          exam: {
            yearLevel: { in: validYearLevels }
          }
        }

    // Get exam scores by section
    const examScores = await prisma.examScore.findMany({
      where: examWhereClause,
      include: {
        exam: {
          include: {
            examSection: true
          }
        }
      }
    })

    // Get all exams applicable to this student's year level to find missing ones
    const allApplicableExams = await prisma.exam.findMany({
      where: academicYearId
        ? {
            academicYearId,
            yearLevel: { in: validYearLevels }
          }
        : {
            yearLevel: { in: validYearLevels }
          },
      include: {
        examSection: true
      },
      orderBy: {
        examDate: 'desc'
      }
    })

    // Find exams the student hasn't taken (only past exams, not upcoming ones)
    const now = new Date()
    const takenExamIds = new Set(examScores.map(s => s.exam.id))
    const missingExams = allApplicableExams
      .filter(exam => !takenExamIds.has(exam.id) && new Date(exam.examDate) < now)
      .map(exam => ({
        id: exam.id,
        examDate: exam.examDate,
        totalPoints: exam.totalPoints,
        yearLevel: exam.yearLevel,
        sectionName: exam.examSection.name,
        sectionDisplayName: exam.examSection.displayName
      }))

    // Group scores by section
    const scoresBySection: { [key: string]: number[] } = {}
    examScores.forEach(score => {
      const sectionName = score.exam.examSection.name
      if (!scoresBySection[sectionName]) {
        scoresBySection[sectionName] = []
      }
      scoresBySection[sectionName].push(score.percentage)
    })

    // Calculate averages per section
    const sectionAverages = Object.entries(scoresBySection).map(([section, scores]) => {
      const average = scores.reduce((a, b) => a + b, 0) / scores.length
      return {
        section,
        average,
        scores,
        passingMet: average >= 60
      }
    })

    // Calculate overall average
    const allScores = Object.values(scoresBySection).flat()
    // If no exam scores yet, return null (not 0) - don't penalize for exams that haven't happened
    const overallAverage = allScores.length > 0
      ? allScores.reduce((a, b) => a + b, 0) / allScores.length
      : null
    // If no exam data, treat as "met" (not penalized) until data exists
    const overallAverageMet = overallAverage === null ? true : overallAverage >= 75

    // Check if all sections have at least 60%
    // If no sections yet, treat as passing (not penalized)
    const allSectionsPassing = sectionAverages.length === 0 ? true : sectionAverages.every(s => s.passingMet)

    // Async student data
    let sundaySchool = null
    let sundaySchoolMet = true // Default true for non-async students

    if (enrollment.isAsyncStudent) {
      // Get Sunday School assignments with logs
      const ssAssignments = await prisma.sundaySchoolAssignment.findMany({
        where: { studentId },
        include: {
          logs: true,
          academicYear: { select: { id: true, name: true } }
        }
      })

      const assignmentData = ssAssignments.map(assignment => {
        const attendance = rotationAttendanceToDate(assignment)
        const weeks = getAssignmentWeeks(assignment.startDate, assignment.totalWeeks)
        const weekDetails = weeks.map(w => {
          const log = assignment.logs.find(l => l.weekNumber === w.weekNumber)
          return {
            weekNumber: w.weekNumber,
            weekOf: w.weekOf,
            status: log?.status ?? null
          }
        })

        return {
          id: assignment.id,
          grade: assignment.grade,
          yearLevel: assignment.yearLevel,
          academicYear: assignment.academicYear,
          totalWeeks: assignment.totalWeeks,
          startDate: assignment.startDate,
          isActive: assignment.isActive,
          attendance: attendance ? {
            present: attendance.present,
            excused: attendance.excused,
            absent: attendance.absent,
            effectiveTotal: attendance.effectiveTotal,
            percentage: attendance.percentage,
            met: attendance.met
          } : null,
          weeks: weekDetails
        }
      })

      const metFor = (level: string) => {
        const rotation = assignmentData.find(a => a.yearLevel === level && a.isActive)
        if (!rotation) return level !== enrollment.yearLevel // the current year needs one
        return rotation.attendance ? rotation.attendance.met : true
      }
      const requirement = rotationRequirementMet(assignmentData, enrollment.yearLevel)

      sundaySchool = {
        assignments: assignmentData,
        year1Met: metFor('YEAR_1'),
        year2Met: metFor('YEAR_2'),
        needsRotation: requirement.needsRotation,
        allMet: requirement.met
      }

      sundaySchoolMet = sundaySchool.allMet
    }

    // Graduation eligibility (includes Sunday School for async students)
    // An async student's rotation is their attendance, so it counts as evidence
    // even when no lessons are on record (async from the start, no slips).
    const rotationPercentage = sundaySchool?.assignments.find(
      (a) => a.isActive && a.yearLevel === enrollment.yearLevel
    )?.attendance?.percentage ?? null
    const graduationEligible = isGraduationEligible({
      attendancePercentage: attendancePercentage ?? rotationPercentage,
      examAverage: overallAverage,
      requirementsMet: [attendanceMet, overallAverageMet, allSectionsPassing, sundaySchoolMet],
    })

    return NextResponse.json({
      enrollment,
      attendance: {
        totalLessons: effectiveTotalLessons, // Total lessons minus excused
        allLessons: lessonsWithAttendance, // All lessons with attendance taken
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        notEnrolledYetCount,
        expectedAbsenceNACount,
        effectivePresent,
        percentage: attendancePercentage,
        met: attendanceMet,
        required: 75,
        conductDismissalCount,
      },
      exams: {
        sectionAverages,
        overallAverage,
        overallAverageMet,
        allSectionsPassing,
        requiredAverage: 75,
        requiredMinimum: 60,
        missingExams,
        totalApplicableExams: allApplicableExams.length,
        examsTaken: examScores.length
      },
      graduation: {
        eligible: graduationEligible,
        attendanceMet,
        overallAverageMet,
        allSectionsPassing,
        sundaySchoolMet: enrollment.isAsyncStudent ? sundaySchoolMet : undefined
      },
      ...(enrollment.isAsyncStudent ? { sundaySchool } : {})
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
