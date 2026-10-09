import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { UserRole } from "@prisma/client"
import { isAdmin } from "@/lib/roles"
import { requireExamScoreWriter } from '@/lib/exam-score-service'
import { handleApiError } from '@/lib/api-utils'
import { notifyGradePosted } from "@/lib/notifications"


// GET /api/exams/[id]/scores - Get scores for an exam (Admins see all, Mentors see only their mentees)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    // Build where clause based on role
    const where: { examId: string; student?: { enrollments: { some: { mentorId: string } } } } = { examId: id }

    // If MENTOR role, restrict to only their mentees
    if (user.role === UserRole.MENTOR) {
      where.student = {
        enrollments: {
          some: {
            mentorId: user.id
          }
        }
      }
    } else if (!isAdmin(user.role)) {
      // Non-admin, non-mentor roles are forbidden
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const scores = await prisma.examScore.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        },
        grader: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        percentage: 'desc'
      }
    })

    return NextResponse.json(scores)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exam scores" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// POST /api/exams/[id]/scores - Add an original grade (prep staff only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireExamScoreWriter()
    const { id: examId } = await params
    const body = await request.json()
    const { studentId, score, notes } = body

    if (!studentId || score === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get exam to calculate percentage
    const exam = await prisma.exam.findUnique({
      where: { id: examId }
    })

    if (!exam) {
      return NextResponse.json(
        { error: "Exam not found" },
        { status: 404 }
      )
    }

    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > exam.totalPoints) return NextResponse.json({ error: 'Score must be between zero and the exam total points.' }, { status: 400 })
    const percentage = (score / exam.totalPoints) * 100

    // Check if score already exists
    const existing = await prisma.examScore.findUnique({
      where: {
        examId_studentId: {
          examId,
          studentId
        }
      }
    })

    if (existing) {
      return NextResponse.json(
        { error: "Score already exists for this student" },
        { status: 400 }
      )
    }

    // Get exam section info for notification
    const examWithSection = await prisma.exam.findUnique({
      where: { id: examId },
      include: { examSection: { select: { displayName: true } } },
    })

    const examScore = await prisma.examScore.create({
      data: {
        examId,
        studentId,
        score,
        percentage,
        originalScore: score,
        originalPercentage: percentage,
        notes: notes || null,
        gradedBy: user.id,
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

    // Send notification (non-blocking)
    notifyGradePosted({
      studentId,
      studentName: examScore.student.name,
      examSection: examWithSection?.examSection?.displayName || 'Exam',
      percentage,
    }).catch(() => {})

    return NextResponse.json(examScore, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
