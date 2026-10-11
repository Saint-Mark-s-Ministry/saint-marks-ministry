import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { isAdmin } from "@/lib/roles"
import { AttendanceStatus, YearLevel, ExamYearLevel } from "@prisma/client"
import { excludeAsyncPeriodRecords } from "@/lib/attendance-utils"

// GET /api/dashboard/analytics - Get detailed analytics for the dashboard
export async function GET() {
  try {
    const user = await requireAuth()

    if (!isAdmin(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // Get all academic years
    const academicYears = await prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, isActive: true }
    })

    const activeYear = academicYears.find(y => y.isActive)

    // Get all exam sections
    const examSections = await prisma.examSection.findMany({
      select: { id: true, name: true, displayName: true }
    })

    // Get exam scores with exam and section info (ALL exams, not filtered by year)
    const examScores = await prisma.examScore.findMany({
      select: {
        score: true,
        studentId: true,
        exam: {
          select: {
            id: true,
            academicYearId: true,
            examSectionId: true,
            yearLevel: true
          }
        }
      }
    })

    // Get all exams to count properly
    const allExams = await prisma.exam.findMany({
      select: {
        id: true,
        academicYearId: true,
        yearLevel: true
      }
    })

    // Get students at risk (below 75% attendance or exam average)
    const activeEnrollments = await prisma.studentEnrollment.findMany({
      where: { isActive: true },
      select: {
        student: {
          select: {
            id: true,
            name: true
          }
        },
        yearLevel: true
      }
    })

    // Async students: lessons from the day they went async count only if a slip
    // covered them (their attendance is their Sunday School rotation)
    const asyncEnrollments = await prisma.studentEnrollment.findMany({
      where: { isAsyncStudent: true },
      select: { studentId: true, isAsyncStudent: true, asyncApprovedAt: true },
    })
    const asyncExclusion = excludeAsyncPeriodRecords(asyncEnrollments)

    // Get attendance records with lesson info (exclude exam day lessons)
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        lesson: {
          isExamDay: false
        },
        ...asyncExclusion,
      },
      select: {
        status: true,
        lesson: {
          select: {
            academicYearId: true
          }
        }
      }
    })


    // Calculate exam averages per section per academic year
    const examAveragesByYearAndSection: Record<string, Record<string, { total: number; count: number }>> = {}

    for (const score of examScores) {
      const yearId = score.exam.academicYearId
      const sectionId = score.exam.examSectionId

      if (!examAveragesByYearAndSection[yearId]) {
        examAveragesByYearAndSection[yearId] = {}
      }
      if (!examAveragesByYearAndSection[yearId][sectionId]) {
        examAveragesByYearAndSection[yearId][sectionId] = { total: 0, count: 0 }
      }

      examAveragesByYearAndSection[yearId][sectionId].total += score.score
      examAveragesByYearAndSection[yearId][sectionId].count += 1
    }

    // Calculate attendance stats per academic year
    const attendanceByYear: Record<string, { present: number; late: number; absent: number; excused: number; total: number }> = {}

    for (const record of attendanceRecords) {
      const yearId = record.lesson.academicYearId

      if (!attendanceByYear[yearId]) {
        attendanceByYear[yearId] = { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
      }

      attendanceByYear[yearId].total += 1
      if (record.status === AttendanceStatus.PRESENT) {
        attendanceByYear[yearId].present += 1
      } else if (record.status === AttendanceStatus.LATE) {
        attendanceByYear[yearId].late += 1
      } else if (record.status === AttendanceStatus.ABSENT) {
        attendanceByYear[yearId].absent += 1
      } else if (record.status === AttendanceStatus.EXCUSED) {
        attendanceByYear[yearId].excused += 1
      }
    }

    // Get individual student analytics for at-risk calculation
    const studentIds = activeEnrollments.map(e => e.student.id)

    // Get attendance per student (exclude exam day lessons)
    const studentAttendance = await prisma.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      where: {
        studentId: { in: studentIds },
        lesson: {
          isExamDay: false
        },
        ...asyncExclusion,
      },
      _count: true
    })

    // Get exam scores per student
    const studentExamScores = await prisma.examScore.findMany({
      where: {
        studentId: { in: studentIds }
      },
      select: {
        studentId: true,
        score: true
      }
    })

    // Calculate at-risk students
    const studentAttendanceMap: Record<string, { present: number; late: number; absent: number; excused: number; total: number }> = {}

    for (const record of studentAttendance) {
      if (!studentAttendanceMap[record.studentId]) {
        studentAttendanceMap[record.studentId] = { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
      }

      studentAttendanceMap[record.studentId].total += record._count
      if (record.status === AttendanceStatus.PRESENT) {
        studentAttendanceMap[record.studentId].present += record._count
      } else if (record.status === AttendanceStatus.LATE) {
        studentAttendanceMap[record.studentId].late += record._count
      } else if (record.status === AttendanceStatus.ABSENT) {
        studentAttendanceMap[record.studentId].absent += record._count
      } else if (record.status === AttendanceStatus.EXCUSED) {
        studentAttendanceMap[record.studentId].excused += record._count
      }
    }

    const studentExamScoresMap: Record<string, number[]> = {}
    for (const score of studentExamScores) {
      if (!studentExamScoresMap[score.studentId]) {
        studentExamScoresMap[score.studentId] = []
      }
      studentExamScoresMap[score.studentId].push(score.score)
    }

    // Identify at-risk students and track students on track
    const atRiskStudents: Array<{
      id: string
      name: string
      yearLevel: string
      attendanceRate: number | null
      examAverage: number | null
      issues: string[]
    }> = []

    // Track students meeting thresholds
    let studentsWithGoodAttendance = 0
    let studentsWithLowAttendance = 0
    let studentsWithGoodExams = 0
    let studentsWithLowExams = 0
    let studentsFullyOnTrack = 0  // Both attendance AND exams >= 75%

    for (const enrollment of activeEnrollments) {
      const studentId = enrollment.student.id
      const attendance = studentAttendanceMap[studentId]
      const scores = studentExamScoresMap[studentId] || []

      let attendanceRate: number | null = null
      let examAverage: number | null = null
      const issues: string[] = []
      let hasGoodAttendance = false
      let hasGoodExams = false

      if (attendance && attendance.total > 0) {
        const countableLessons = attendance.total - attendance.excused
        if (countableLessons > 0) {
          attendanceRate = ((attendance.present + (attendance.late / 2)) / countableLessons) * 100
          if (attendanceRate < 75) {
            issues.push(`Low attendance: ${attendanceRate.toFixed(2)}%`)
            studentsWithLowAttendance++
          } else {
            hasGoodAttendance = true
            studentsWithGoodAttendance++
          }
        } else {
          // All lessons were excused - don't penalize
          hasGoodAttendance = true
        }
      } else {
        // No attendance records yet - lessons haven't happened, don't penalize
        hasGoodAttendance = true
      }

      if (scores.length > 0) {
        examAverage = scores.reduce((a, b) => a + b, 0) / scores.length
        if (examAverage < 75) {
          issues.push(`Low exam average: ${examAverage.toFixed(2)}%`)
          studentsWithLowExams++
        } else {
          hasGoodExams = true
          studentsWithGoodExams++
        }
      } else {
        // No exam scores yet - student hasn't taken exams, don't penalize them
        hasGoodExams = true  // Treat as on track until they have actual scores
      }

      // Student is fully on track if they have good attendance AND good exams
      // Students with no exam scores yet are not penalized (hasGoodExams = true)
      if (hasGoodAttendance && hasGoodExams) {
        studentsFullyOnTrack++
      }

      if (issues.length > 0) {
        atRiskStudents.push({
          id: studentId,
          name: enrollment.student.name,
          yearLevel: enrollment.yearLevel,
          attendanceRate,
          examAverage,
          issues
        })
      }
    }

    // Sort at-risk students by severity (more issues first, then by lowest scores)
    atRiskStudents.sort((a, b) => {
      if (b.issues.length !== a.issues.length) {
        return b.issues.length - a.issues.length
      }
      const aMin = Math.min(a.attendanceRate ?? 100, a.examAverage ?? 100)
      const bMin = Math.min(b.attendanceRate ?? 100, b.examAverage ?? 100)
      return aMin - bMin
    })

    // Find weakest sections (lowest average scores)
    const sectionAverages: Array<{ sectionId: string; displayName: string; average: number; count: number }> = []

    for (const section of examSections) {
      let totalScore = 0
      let totalCount = 0

      for (const yearId in examAveragesByYearAndSection) {
        const sectionData = examAveragesByYearAndSection[yearId][section.id]
        if (sectionData) {
          totalScore += sectionData.total
          totalCount += sectionData.count
        }
      }

      if (totalCount > 0) {
        sectionAverages.push({
          sectionId: section.id,
          displayName: section.displayName,
          average: totalScore / totalCount,
          count: totalCount
        })
      }
    }

    sectionAverages.sort((a, b) => a.average - b.average)

    // Format response
    const examScoresByYear = academicYears.map(year => {
      const yearData = examAveragesByYearAndSection[year.id] || {}
      const sections = examSections.map(section => {
        const data = yearData[section.id]
        return {
          sectionId: section.id,
          displayName: section.displayName,
          average: data ? data.total / data.count : null,
          count: data?.count || 0
        }
      })

      // Calculate overall average for the year
      let totalScore = 0
      let totalCount = 0
      for (const section of sections) {
        if (section.average !== null) {
          totalScore += section.average * section.count
          totalCount += section.count
        }
      }

      return {
        yearId: year.id,
        yearName: year.name,
        isActive: year.isActive,
        overallAverage: totalCount > 0 ? totalScore / totalCount : null,
        sections
      }
    })

    const attendanceByYearFormatted = academicYears.map(year => {
      const data = attendanceByYear[year.id] || { present: 0, late: 0, absent: 0, excused: 0, total: 0 }
      const countable = data.total - data.excused
      const rate = countable > 0 ? ((data.present + (data.late / 2)) / countable) * 100 : null

      return {
        yearId: year.id,
        yearName: year.name,
        isActive: year.isActive,
        present: data.present,
        late: data.late,
        absent: data.absent,
        excused: data.excused,
        total: data.total,
        attendanceRate: rate
      }
    })

    // Calculate program-wide exam stats
    // For Year 2 students, include exams from both current year AND previous year (their Year 1 exams)
    const year2Students = activeEnrollments.filter(e => e.yearLevel === YearLevel.YEAR_2).map(e => e.student.id)
    const year1Students = activeEnrollments.filter(e => e.yearLevel === YearLevel.YEAR_1).map(e => e.student.id)

    // Count relevant exams for current active students
    // Current year exams (for all students)
    const currentYearExams = allExams.filter(e => activeYear && e.academicYearId === activeYear.id)

    // Count exam scores for active students
    const activeStudentIds = new Set(activeEnrollments.map(e => e.student.id))
    const activeStudentScores = examScores.filter(s => activeStudentIds.has(s.studentId))

    // Count exams by year level
    // An exam with BOTH applies to both Year 1 and Year 2 students
    const year1OnlyExams = allExams.filter(e => e.yearLevel === ExamYearLevel.YEAR_1)
    const bothYearsExams = allExams.filter(e => e.yearLevel === ExamYearLevel.BOTH)

    // Year 1 students need: YEAR_1 exams + BOTH exams
    const examsForYear1Students = year1OnlyExams.length + bothYearsExams.length
    // Year 2 students need: YEAR_1 exams + YEAR_2 exams + BOTH exams (all of them)
    const examsForYear2Students = allExams.length

    // Get lesson counts by academic year (excluding exam days)
    const lessonsByYear = await prisma.lesson.groupBy({
      by: ['academicYearId'],
      where: {
        isExamDay: false
      },
      _count: true
    })

    // Create a map of lessons per year
    const lessonCountByYear: Record<string, number> = {}
    for (const lesson of lessonsByYear) {
      lessonCountByYear[lesson.academicYearId] = lesson._count
    }

    // Get exam counts by academic year
    const examsByYear = await prisma.exam.groupBy({
      by: ['academicYearId'],
      _count: true
    })

    // Create a map of exams per year
    const examCountByYear: Record<string, number> = {}
    for (const exam of examsByYear) {
      examCountByYear[exam.academicYearId] = exam._count
    }

    // Get exam scores count by academic year
    const examScoresByAcademicYear = await prisma.examScore.groupBy({
      by: ['examId'],
      _count: true
    })

    // Map exam scores to academic year
    const examIdToYear: Record<string, string> = {}
    for (const exam of allExams) {
      examIdToYear[exam.id] = exam.academicYearId
    }

    const examScoresCountByYear: Record<string, number> = {}
    for (const scoreGroup of examScoresByAcademicYear) {
      const yearId = examIdToYear[scoreGroup.examId]
      if (yearId) {
        if (!examScoresCountByYear[yearId]) {
          examScoresCountByYear[yearId] = 0
        }
        examScoresCountByYear[yearId] += scoreGroup._count
      }
    }

    // Program overview stats
    const programOverview = {
      // Total exams in current academic year
      currentYearExams: currentYearExams.length,
      // Total exams in the database
      totalRelevantExams: allExams.length,
      // Exam counts by student year level
      year1ExamsNeeded: examsForYear1Students,
      year2ExamsNeeded: examsForYear2Students,
      // Student counts
      year1StudentCount: year1Students.length,
      year2StudentCount: year2Students.length,
      // Scores recorded
      totalScoresRecorded: activeStudentScores.length,
      // Average scores across all active students (all their exams)
      overallProgramAverage: activeStudentScores.length > 0
        ? activeStudentScores.reduce((sum, s) => sum + s.score, 0) / activeStudentScores.length
        : null,
      // Students meeting 75% threshold
      studentsWithGoodAttendance,
      studentsWithLowAttendance,
      studentsWithGoodExams,
      studentsWithLowExams,
      studentsFullyOnTrack,
      totalActiveStudents: activeEnrollments.length,
      // Lessons by year (excluding exam days)
      lessonCountByYear,
      // Exams by year
      examCountByYear,
      // Exam scores by year
      examScoresCountByYear
    }

    return NextResponse.json({
      examScoresByYear,
      attendanceByYear: attendanceByYearFormatted,
      atRiskStudents: atRiskStudents.slice(0, 10), // Top 10 at-risk
      weakestSections: sectionAverages.slice(0, 3), // Bottom 3 sections
      totalAtRisk: atRiskStudents.length,
      programOverview
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch analytics" },
      { status: 500 }
    )
  }
}
