import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

// GET /api/students/[id]/lessons - Get lessons for a student with their attendance
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id: studentId } = await params

    // Students can only view their own lessons
    if (session.user.role === 'STUDENT' && session.user.id !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Get student's enrollment to determine year level
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId },
      select: {
        yearLevel: true,
        isActive: true
      }
    })

    if (!enrollment || !enrollment.isActive) {
      return NextResponse.json({ error: "Student not enrolled" }, { status: 404 })
    }

    // Build lesson filter based on year level
    // Year 1 students: Only see active academic year lessons
    // Year 2 students: See lessons from all years (both Year 1 and Year 2)
    // Cancelled lessons are hidden by default (the web page relies on that).
    // The mobile "My lessons" screen opts in with ?includeCancelled=true so it can explain them.
    const includeCancelled = new URL(request.url).searchParams.get('includeCancelled') === 'true'
    const lessonWhereClause: Record<string, unknown> = {
      status: { notIn: includeCancelled ? ['NO_CLASS'] : ['CANCELLED', 'NO_CLASS'] },
      isExamDay: false
    }

    if (enrollment.yearLevel === 'YEAR_1') {
      // Year 1 students only see current academic year
      const activeAcademicYear = await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true }
      })

      if (!activeAcademicYear) {
        return NextResponse.json({ error: "No active academic year" }, { status: 404 })
      }

      lessonWhereClause.academicYearId = activeAcademicYear.id
    }
    // Year 2 students see all lessons (no academicYearId filter)

    // Get lessons, excluding cancelled and exam days
    const lessons = await prisma.lesson.findMany({
      where: lessonWhereClause,
      include: {
        examSection: {
          select: {
            id: true,
            name: true,
            displayName: true
          }
        },
        academicYear: {
          select: {
            id: true,
            name: true,
            isActive: true
          }
        },
        resources: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        attendanceRecords: {
          where: {
            studentId: studentId
          },
          select: {
            id: true,
            status: true,
            arrivedAt: true,
            notes: true,
            conductRemoval: true,
            notEnrolledYet: true,
            expectedAbsenceNA: true,
          }
        }
      },
      orderBy: {
        scheduledDate: 'desc'
      },
      take: 100 // Limit to recent 100 lessons
    })

    // Transform the data to include attendance status
    const lessonsWithAttendance = lessons.map(lesson => ({
      id: lesson.id,
      title: lesson.title,
      subtitle: lesson.subtitle,
      speaker: lesson.speaker,
      description: lesson.description,
      scheduledDate: lesson.scheduledDate,
      lessonNumber: lesson.lessonNumber,
      status: lesson.status,
      cancellationReason: lesson.cancellationReason,
      examSection: lesson.examSection,
      academicYear: lesson.academicYear,
      resources: lesson.resources,
      attendance: lesson.attendanceRecords[0] || null // Student can only have one attendance record per lesson
    }))

    return NextResponse.json(lessonsWithAttendance)
  } catch (error: unknown) {
    console.error('Failed to fetch student lessons:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch lessons" },
      { status: 500 }
    )
  }
}
