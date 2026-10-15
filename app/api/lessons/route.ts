import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canManageCurriculum } from "@/lib/roles"
import { handleApiError, assertSafeHttpUrl } from "@/lib/api-utils"
import { LessonStatus } from "@prisma/client"
import { notifyLessonScheduled } from "@/lib/notifications"


// GET /api/lessons - List lessons
// Query params:
//   ?academicYearId=xxx - filter by academic year
//   ?examSectionId=xxx - filter by exam section
//   ?status=COMPLETED - filter by status
//   ?excludeCancelled=true - exclude cancelled lessons (for attendance page)
//   ?excludeExamDays=true - exclude exam day lessons (for attendance page)
//   ?forAttendance=true - shorthand for excludeCancelled + excludeExamDays
//   ?page=1&limit=50 - pagination (default: all results for backwards compatibility)
export async function GET(request: Request) {
  try {
    await requireAuth()

    const { searchParams } = new URL(request.url)
    const academicYearId = searchParams.get('academicYearId')
    const examSectionId = searchParams.get('examSectionId')
    const status = searchParams.get('status')
    const excludeCancelled = searchParams.get('excludeCancelled') === 'true' || searchParams.get('forAttendance') === 'true'
    const excludeExamDays = searchParams.get('excludeExamDays') === 'true' || searchParams.get('forAttendance') === 'true'
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!) : null
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const search = searchParams.get('search')

    const where: Record<string, unknown> = {}
    if (academicYearId) where.academicYearId = academicYearId
    if (examSectionId) where.examSectionId = examSectionId
    if (search && search.trim()) {
      const term = search.trim()
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { subtitle: { contains: term, mode: 'insensitive' } },
      ]
    }

    // Handle status filtering - excludeCancelled takes precedence
    if (excludeCancelled) {
      // Exclude CANCELLED status using notIn for explicit filtering
      where.status = { notIn: [LessonStatus.CANCELLED, LessonStatus.NO_CLASS] }
    } else if (status) {
      where.status = status
    }

    // Exclude exam days if requested
    if (excludeExamDays) {
      where.isExamDay = { not: true }
    }

    const queryOptions: {
      where: Record<string, unknown>
      include: Record<string, unknown>
      orderBy: { scheduledDate: 'asc' }
      skip?: number
      take?: number
    } = {
      where,
      include: {
        examSection: true,
        academicYear: {
          select: {
            id: true,
            name: true,
          }
        },
        creator: {
          select: {
            id: true,
            name: true,
          }
        },
        resources: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        _count: {
          select: {
            attendanceRecords: {
              where: {
                status: { in: ['PRESENT', 'LATE'] },
                student: { enrollments: { none: { isAsyncStudent: true } } }
              }
            }
          }
        }
      },
      orderBy: {
        scheduledDate: 'asc'
      }
    }

    // Add pagination if requested
    if (page !== null) {
      queryOptions.skip = (page - 1) * limit
      queryOptions.take = limit

      const [lessons, total] = await Promise.all([
        prisma.lesson.findMany(queryOptions),
        prisma.lesson.count({ where })
      ])

      return NextResponse.json({
        data: lessons,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      })
    }

    // No pagination - return all (backwards compatible)
    const lessons = await prisma.lesson.findMany(queryOptions)

    return NextResponse.json(lessons)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/lessons - Create a new lesson (SUPER_ADMIN and SERVANT_PREP only, PRIEST is read-only)
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    // PRIEST is read-only, only SUPER_ADMIN and SERVANT_PREP can manage curriculum
    if (!canManageCurriculum(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { academicYearId, examSectionId, title, subtitle, description, scheduledDate, resources, isExamDay, speaker } = body

    if (!academicYearId || !examSectionId || !title || !scheduledDate) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (Array.isArray(resources)) {
      for (const r of resources as Array<{ url?: string; title?: string }>) {
        assertSafeHttpUrl(r?.url ?? "", `Resource "${r?.title ?? ""}" URL`)
      }
    }

    // Compute lessonNumber server-side to avoid race conditions and cross-year bugs
    const lesson = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.lesson.aggregate({
        where: { academicYearId },
        _max: { lessonNumber: true },
      })
      const nextLessonNumber = (maxResult._max.lessonNumber ?? 0) + 1

      return tx.lesson.create({
        data: {
          academicYearId,
          examSectionId,
          title,
          subtitle: subtitle || null,
          description: description || null,
          scheduledDate: new Date(scheduledDate),
          lessonNumber: nextLessonNumber,
          isExamDay: isExamDay || false,
          speaker: speaker || null,
          createdBy: user.id,
          resources: resources && resources.length > 0 ? {
            create: resources.map((r: { title: string; url: string; type?: string }) => ({
              title: r.title,
              url: r.url,
              type: r.type || null,
            }))
          } : undefined,
        },
        include: {
          examSection: true,
          academicYear: {
            select: {
              id: true,
              name: true,
            }
          },
          creator: {
            select: {
              id: true,
              name: true,
            }
          },
          resources: {
            orderBy: {
              createdAt: 'asc'
            }
          },
          _count: {
            select: {
              attendanceRecords: {
                where: {
                  status: { in: ['PRESENT', 'LATE'] },
                  student: { enrollments: { none: { isAsyncStudent: true } } }
                }
              }
            }
          }
        }
      })
    })

    // Notify students about the new lesson (non-blocking)
    if (lesson.examSection?.displayName) {
      notifyLessonScheduled({
        lessonTitle: lesson.title,
        lessonDate: new Date(scheduledDate).toLocaleDateString(),
        examSection: lesson.examSection.displayName,
      }).catch(() => {})
    }

    return NextResponse.json(lesson, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
