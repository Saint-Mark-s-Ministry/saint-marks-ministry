import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { isAdmin } from "@/lib/roles"
import { LessonStatus } from "@prisma/client"
import { excludeAsyncPeriodRecords } from "@/lib/attendance-utils"

// GET /api/students/[id]/details - Get detailed student data for editing
// NOTE: academicYearId parameter is optional. If not provided, returns data across ALL academic years.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id: studentId } = await params

    // Only admins can view detailed student data
    if (!isAdmin(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const academicYearId = searchParams.get('academicYearId')

    // academicYearId is now optional - if not provided, return data across all years

    // Get student with enrollment
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        createdFromRegistration: {
          select: {
            id: true,
            status: true,
            createdAt: true,
            reviewedAt: true,
            reviewNote: true,
            approvalFormUrl: true,
            fatherOfConfessionName: true,
            mentorName: true,
            mentorPhone: true,
            mentorEmail: true,
            reviewer: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        enrollments: {
          include: {
            mentor: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            fatherOfConfession: {
              select: {
                id: true,
                name: true,
                phone: true,
                church: true
              }
            }
          }
        }
      }
    })

    if (!student) {
      return NextResponse.json(
        { error: "Student not found" },
        { status: 404 }
      )
    }

    // Build exam filter - if academicYearId provided, filter by it; otherwise include all
    const examFilter = academicYearId ? { academicYearId } : {}

    // Build lesson filter - if academicYearId provided, filter by it; otherwise include all
    const validStatuses: LessonStatus[] = [LessonStatus.SCHEDULED, LessonStatus.COMPLETED]
    const lessonFilter = academicYearId
      ? { academicYearId, status: { in: validStatuses } }
      : { status: { in: validStatuses } }

    // Get all exam scores with exam and section details
    const examScores = await prisma.examScore.findMany({
      where: {
        studentId,
        exam: examFilter
      },
      include: {
        exam: {
          include: {
            examSection: true,
            academicYear: true
          }
        },
        grader: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        gradedAt: 'desc'
      }
    })

    // Get all attendance records with lesson details
    // Include isExamDay field so frontend can filter/display appropriately
    // Async-period lessons without a slip aren't counted, so they aren't listed either
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        lesson: lessonFilter,
        ...excludeAsyncPeriodRecords(student.enrollments.map((e) => ({ ...e, studentId }))),
      },
      include: {
        lesson: {
          include: {
            examSection: true,
            academicYear: true
          }
        },
        recorder: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        lesson: {
          scheduledDate: 'desc'
        }
      }
    })

    // Get all exams (to show missing scores)
    // Limited to recent 6 months for performance
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const allExams = await prisma.exam.findMany({
      where: {
        ...examFilter,
        yearLevel: {
          in: student.enrollments?.[0]?.yearLevel ?
            ['BOTH', student.enrollments[0].yearLevel] :
            ['BOTH']
        },
        examDate: {
          gte: sixMonthsAgo
        }
      },
      include: {
        examSection: true,
        academicYear: true
      },
      orderBy: {
        examDate: 'desc'
      },
      take: 50 // Limit to 50 most recent exams
    })

    // Get all lessons (to show missing attendance)
    // Limited to recent 6 months for performance
    const allLessons = await prisma.lesson.findMany({
      where: {
        ...lessonFilter,
        scheduledDate: {
          gte: sixMonthsAgo
        }
      },
      include: {
        examSection: true,
        academicYear: true
      },
      orderBy: {
        scheduledDate: 'desc'
      },
      take: 100 // Limit to 100 most recent lessons
    })

    return NextResponse.json({
      student,
      examScores,
      attendanceRecords,
      allExams,
      allLessons
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch student details" },
      { status: 500 }
    )
  }
}
