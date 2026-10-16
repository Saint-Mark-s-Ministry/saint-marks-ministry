import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { canManageCurriculum } from "@/lib/roles"
import { handleApiError, assertSafeHttpUrl } from "@/lib/api-utils"
import { notifyLessonCancelled } from "@/lib/notifications"


// PATCH /api/lessons/[id] - Update a lesson (SUPER_ADMIN, PRIEST, and SERVANT_PREP)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()

    // SUPER_ADMIN, PRIEST, and SERVANT_PREP can manage curriculum
    if (!canManageCurriculum(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }
    const { id } = await params
    const body = await request.json()
    const { title, subtitle, description, scheduledDate, examSectionId, status, cancellationReason, resources, isExamDay, speaker } = body

    const updateData: Record<string, unknown> = {}
    if (title) updateData.title = title
    if (subtitle !== undefined) updateData.subtitle = subtitle || null
    if (description !== undefined) updateData.description = description || null
    if (scheduledDate) updateData.scheduledDate = new Date(scheduledDate)
    if (examSectionId) updateData.examSection = { connect: { id: examSectionId } }
    if (status) updateData.status = status
    if (cancellationReason !== undefined) updateData.cancellationReason = cancellationReason
    if (isExamDay !== undefined) updateData.isExamDay = isExamDay
    if (speaker !== undefined) updateData.speaker = speaker || null

    // Handle resources update: delete all existing and recreate
    if (resources !== undefined) {
      for (const r of resources as Array<{ url?: string; title?: string }>) {
        assertSafeHttpUrl(r?.url ?? "", `Resource "${r?.title ?? ""}" URL`)
      }

      await prisma.lessonResource.deleteMany({
        where: { lessonId: id }
      })

      if (resources.length > 0) {
        await prisma.lessonResource.createMany({
          data: resources.map((r: { title: string; url: string; type?: string }) => ({
            lessonId: id,
            title: r.title,
            url: r.url,
            type: r.type || null,
          }))
        })
      }
    }

    // Get the current lesson state before update (to detect cancellation)
    const currentLesson = await prisma.lesson.findUnique({
      where: { id },
      select: { status: true, title: true, scheduledDate: true },
    })

    const lesson = await prisma.lesson.update({
      where: { id },
      data: updateData,
      include: {
        examSection: true,
        resources: {
          orderBy: {
            createdAt: 'asc'
          }
        },
        _count: {
          select: {
            attendanceRecords: true
          }
        }
      }
    })

    // Notify students if lesson was just cancelled
    if (
      status === 'CANCELLED' &&
      currentLesson &&
      currentLesson.status !== 'CANCELLED'
    ) {
      notifyLessonCancelled({
        lessonTitle: lesson.title,
        lessonDate: new Date(lesson.scheduledDate).toLocaleDateString(),
        reason: cancellationReason || undefined,
      }).catch(() => {})
    }

    return NextResponse.json(lesson)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/lessons/[id] - Delete a lesson (SUPER_ADMIN, PRIEST, and SERVANT_PREP)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()

    // SUPER_ADMIN, PRIEST, and SERVANT_PREP can manage curriculum
    if (!canManageCurriculum(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }
    const { id } = await params

    await prisma.lesson.delete({
      where: { id }
    })

    return NextResponse.json({ message: "Lesson deleted successfully" })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
