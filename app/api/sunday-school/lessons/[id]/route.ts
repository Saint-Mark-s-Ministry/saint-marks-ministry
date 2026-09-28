import { NextResponse } from "next/server"
import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  canAssignWeeklyLessonOwner,
  canEditWeeklyLesson,
  getSundaySchoolAccess,
} from "@/lib/sunday-school-access"
import {
  getWeeklyLessonStatus,
  validateWeeklyLessonResources,
} from "@/lib/sunday-school-lessons"

const responseInclude = {
  class: { select: { id: true, name: true, level: true } },
  owner: { select: { id: true, name: true, profileImageUrl: true } },
  resources: { orderBy: { sortOrder: "asc" as const } },
} as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const lesson = await prisma.sundaySchoolWeeklyLesson.findUnique({
      where: { id },
      include: { class: { select: { academicYearId: true } } },
    })
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, lesson.class.academicYearId)
    const canAssignOwner = canAssignWeeklyLessonOwner(access, lesson.classId)
    const canEdit = canEditWeeklyLesson(access, lesson.classId)
    const body = await request.json()
    const hasOwner = Object.prototype.hasOwnProperty.call(body, "ownerId")
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title")
    const hasResources = Object.prototype.hasOwnProperty.call(body, "resources")

    if (!hasOwner && !hasTitle && !hasResources) {
      return NextResponse.json({ error: "No lesson changes were provided" }, { status: 400 })
    }
    if (hasOwner && !canAssignOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    if ((hasTitle || hasResources) && !canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let ownerId: string | null | undefined
    if (hasOwner) {
      if (body.ownerId !== null && typeof body.ownerId !== "string") {
        return NextResponse.json({ error: "Invalid lesson owner" }, { status: 400 })
      }
      ownerId = body.ownerId || null
      if (ownerId) {
        const eligible = await prisma.sundaySchoolServantAssignment.findFirst({
          where: {
            userId: ownerId,
            classId: lesson.classId,
            academicYearId: lesson.class.academicYearId,
            endedAt: null,
            user: {
              isDisabled: false,
              role: { in: [UserRole.SERVANT, UserRole.SERVANT_PREP] },
            },
          },
          select: { id: true },
        })
        if (!eligible) {
          return NextResponse.json(
            { error: "Choose an active servant assigned directly to this class" },
            { status: 400 }
          )
        }
      }
    }

    const validatedResources = hasResources
      ? validateWeeklyLessonResources(body.resources)
      : null
    if (validatedResources && !validatedResources.ok) {
      return NextResponse.json({ error: validatedResources.error }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.sundaySchoolWeeklyLesson.update({
        where: { id },
        data: {
          ...(hasTitle
            ? { title: typeof body.title === "string" ? body.title.trim() || null : null }
            : {}),
          ...(hasOwner ? { ownerId, assignedById: user.id } : {}),
        },
      })

      if (validatedResources?.ok) {
        await tx.sundaySchoolWeeklyLessonResource.deleteMany({
          where: { weeklyLessonId: id },
        })
        if (validatedResources.resources.length > 0) {
          await tx.sundaySchoolWeeklyLessonResource.createMany({
            data: validatedResources.resources.map((resource, sortOrder) => ({
              weeklyLessonId: id,
              title: resource.title,
              url: resource.url,
              sortOrder,
            })),
          })
        }
      }

      return tx.sundaySchoolWeeklyLesson.findUniqueOrThrow({
        where: { id },
        include: responseInclude,
      })
    })

    return NextResponse.json({
      ...updated,
      status: getWeeklyLessonStatus(updated.ownerId, updated.resources.length),
      canEdit: canEditWeeklyLesson(access, updated.classId),
      canAssignOwner,
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
