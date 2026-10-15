import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { isAdmin } from '@/lib/roles'
import { AttendanceStatus } from '@prisma/client'

export async function GET() {
  try {
    const user = await requireAuth()
    if (!isAdmin(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } })

    const lessonWhere = activeYear ? { academicYearId: activeYear.id } : {}

    // Attendance trend: per-lesson attendance rate, oldest -> newest
    const lessons = await prisma.lesson.findMany({
      where: { ...lessonWhere, isExamDay: false, status: 'COMPLETED' },
      orderBy: { scheduledDate: 'asc' },
      select: {
        id: true,
        title: true,
        scheduledDate: true,
        lessonNumber: true,
        attendanceRecords: { where: { student: { enrollments: { none: { isAsyncStudent: true } } } }, select: { status: true } },
      },
      take: 60,
    })

    const attendancePoints = lessons.map(lesson => {
      let present = 0
      let late = 0
      let excused = 0
      let absent = 0
      for (const a of lesson.attendanceRecords) {
        if (a.status === AttendanceStatus.PRESENT) present++
        else if (a.status === AttendanceStatus.LATE) late++
        else if (a.status === AttendanceStatus.EXCUSED) excused++
        else if (a.status === AttendanceStatus.ABSENT) absent++
      }
      const denom = present + late + absent
      const rate = denom > 0 ? ((present + late / 2) / denom) * 100 : null
      return {
        label: `#${lesson.lessonNumber}`,
        date: lesson.scheduledDate.toISOString(),
        attendanceRate: rate === null ? null : Math.round(rate * 10) / 10,
        presentCount: present,
        totalCount: denom + excused,
      }
    })

    // Exam trend: per-exam class average, oldest -> newest
    const examWhere = activeYear ? { academicYearId: activeYear.id } : {}
    const exams = await prisma.exam.findMany({
      where: examWhere,
      orderBy: { examDate: 'asc' },
      select: {
        id: true,
        examDate: true,
        examSection: { select: { displayName: true } },
        scores: { select: { score: true } },
      },
      take: 60,
    })

    const examPoints = exams.map(exam => {
      const scores = exam.scores.map(s => s.score)
      const avg =
        scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      return {
        label: exam.examDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        date: exam.examDate.toISOString(),
        average: avg === null ? null : Math.round(avg * 10) / 10,
        section: exam.examSection.displayName,
        scoreCount: scores.length,
      }
    })

    return NextResponse.json({
      attendance: attendancePoints,
      exams: examPoints,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
