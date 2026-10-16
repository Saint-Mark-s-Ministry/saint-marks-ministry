import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canManageExams } from "@/lib/roles"


// GET /api/exams - List exams
export async function GET(request: Request) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const academicYearId = searchParams.get('academicYearId')
    const examSectionId = searchParams.get('examSectionId')

    const where: { academicYearId?: string; examSectionId?: string } = {}
    if (academicYearId) where.academicYearId = academicYearId
    if (examSectionId) where.examSectionId = examSectionId

    const exams = await prisma.exam.findMany({
      where,
      include: {
        examSection: true,
        academicYear: {
          select: {
            id: true,
            name: true,
          }
        },
        _count: {
          select: {
            scores: true
          }
        }
      },
      orderBy: {
        examDate: 'desc'
      }
    })

    return NextResponse.json(exams)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch exams" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// POST /api/exams - Create a new exam (SUPER_ADMIN, PRIEST, and SERVANT_PREP)
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // SUPER_ADMIN, PRIEST, and SERVANT_PREP can manage exams
    if (!canManageExams(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { academicYearId, examSectionId, yearLevel, examDate, totalPoints } = body

    if (!academicYearId || !examSectionId || !yearLevel || !examDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const exam = await prisma.exam.create({
      data: {
        academicYearId,
        examSectionId,
        yearLevel,
        examDate: new Date(examDate),
        totalPoints: totalPoints || 100,
      },
      include: {
        examSection: true,
      }
    })

    return NextResponse.json(exam, { status: 201 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create exam" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}
