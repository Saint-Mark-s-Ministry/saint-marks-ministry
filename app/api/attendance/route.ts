import { recordAttendanceAudit } from "@/lib/attendance-audit"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { UserRole } from "@prisma/client"
import { canManageData } from "@/lib/roles"

// GET /api/attendance - List attendance records (Admins see all, Mentors see only their mentees)
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const lessonId = searchParams.get('lessonId')
    const studentId = searchParams.get('studentId')

    const where: { lessonId?: string; studentId?: string; student?: { enrollments: { some: { mentorId: string } } } } = {}
    if (lessonId) where.lessonId = lessonId
    if (studentId) where.studentId = studentId

    // If MENTOR role, restrict to only their mentees
    if (user.role === UserRole.MENTOR) {
      where.student = {
        enrollments: {
          some: {
            mentorId: user.id
          }
        }
      }
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        ...where,
        AND: [{ student: { enrollments: { none: { isAsyncStudent: true } } } }],
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        lesson: {
          select: {
            id: true,
            title: true,
            scheduledDate: true,
            lessonNumber: true,
          }
        },
        recorder: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        recordedAt: 'desc'
      }
    })

    return NextResponse.json(records)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch attendance records" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// POST /api/attendance - Create attendance record (SUPER_ADMIN and SERVANT_PREP only, PRIEST is read-only)
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // Check if user can manage data (PRIEST is read-only)
    if (!canManageData(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { lessonId, studentId, status, arrivedAt, notes } = body

    if (!lessonId || !studentId || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { studentId }, select: { isAsyncStudent: true },
    })
    if (enrollment?.isAsyncStudent) {
      return NextResponse.json({ error: "Async students have rotation attendance; prep lesson attendance does not apply" }, { status: 400 })
    }

    // Check if record already exists
    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        lessonId_studentId: {
          lessonId,
          studentId
        }
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: "Attendance record already exists for this student and lesson" },
        { status: 400 }
      )
    }

    // Validate arrivedAt - only set if it's a valid date
    let validArrivedAt: Date | null = null
    if (arrivedAt && typeof arrivedAt === 'string' && arrivedAt.trim()) {
      const parsedDate = new Date(arrivedAt)
      if (!isNaN(parsedDate.getTime())) {
        validArrivedAt = parsedDate
      }
    }

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })

    const record = await prisma.attendanceRecord.create({
      data: {
        lessonId,
        studentId,
        status,
        arrivedAt: validArrivedAt,
        notes,
        recordedBy: user.id,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    })

    if (lesson) await recordAttendanceAudit({ actorUserId: user.id, action: 'attendance.prep.save',
      entityType: 'Lesson', entityId: lessonId, targetName: lesson.title,
      attendanceDate: lesson.scheduledDate, personIds: [studentId] })

    return NextResponse.json(record, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create attendance record" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}
