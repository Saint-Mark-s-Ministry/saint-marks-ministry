import { NextResponse } from "next/server"
import { UserRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  canAssignWeeklyLessonOwner,
  canEditWeeklyLesson,
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"
import {
  SUNDAY_SCHOOL_LESSON_WINDOW_WEEKS,
  getWeeklyLessonStatus,
} from "@/lib/sunday-school-lessons"
import { normalizeSessionDate } from "@/lib/sunday-school-class"

// Sunday School mode: future-facing weekly lesson plans and their links.
// Deliberately separate from the prep-side Lesson model and from attendance
// sessions, which are created only when attendance is saved.

function parseDate(value: string | null, fallback: Date): Date {
  if (!value) return fallback
  return normalizeSessionDate(value)
}

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(request.url)
    const fullYear = searchParams.get("scope") === "year"
    const upcomingStart = normalizeSessionDate(new Date())
    const upcomingEnd = new Date(upcomingStart)
    upcomingEnd.setUTCDate(
      upcomingEnd.getUTCDate() + SUNDAY_SCHOOL_LESSON_WINDOW_WEEKS * 7 - 1
    )
    let from: Date
    let to: Date
    try {
      from = parseDate(searchParams.get("from"), upcomingStart)
      to = parseDate(searchParams.get("to"), upcomingEnd)
    } catch {
      return NextResponse.json({ error: "Enter valid from and to dates" }, { status: 400 })
    }
    const requestedClassId = searchParams.get("classId")

    if (from > to) {
      return NextResponse.json({ error: "The start date must be before the end date" }, { status: 400 })
    }

    let allowedClassIds: string[] | undefined
    let access: Awaited<ReturnType<typeof getSundaySchoolAccess>> | null = null

    if (user.role === UserRole.PARENT) {
      const links = await prisma.sundaySchoolChildGuardian.findMany({
        where: {
          parentId: user.id,
          child: { isActive: true, classId: { not: null } },
        },
        select: { child: { select: { classId: true } } },
      })
      allowedClassIds = Array.from(new Set(
        links.flatMap((link) => link.child.classId ? [link.child.classId] : [])
      ))
    } else if (user.role === UserRole.STUDENT) {
      const child = await prisma.sundaySchoolChild.findUnique({
        where: { userId: user.id },
        select: { classId: true, isActive: true },
      })
      allowedClassIds = child?.isActive && child.classId ? [child.classId] : []
    } else {
      access = await getSundaySchoolAccess(user)
      if (!access.canRead) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      allowedClassIds = visibleClassFilter(access)
    }

    if (requestedClassId && allowedClassIds && !allowedClassIds.includes(requestedClassId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const openSundaySchoolYear = await prisma.sundaySchoolYear.findFirst({
      where: { status: "OPEN" },
      orderBy: { startDate: "desc" },
      select: { id: true, startDate: true, endDate: true },
    })
    const sundayDateFilter = fullYear && openSundaySchoolYear
      ? {
          gte: normalizeSessionDate(openSundaySchoolYear.startDate),
          lte: normalizeSessionDate(openSundaySchoolYear.endDate),
        }
      : fullYear
        ? undefined
        : { gte: from, lte: to }

    const lessons = await prisma.sundaySchoolWeeklyLesson.findMany({
      where: {
        ...(sundayDateFilter ? { sundayDate: sundayDateFilter } : {}),
        class: {
          isActive: true,
          ...(openSundaySchoolYear
            ? { sundaySchoolYearId: openSundaySchoolYear.id }
            : { academicYear: { isActive: true } }),
        },
        ...(requestedClassId
          ? { classId: requestedClassId }
          : allowedClassIds
            ? { classId: { in: allowedClassIds } }
            : {}),
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            academicYearId: true,
            assignments: {
              where: {
                classId: { not: null },
                endedAt: null,
                user: {
                  isDisabled: false,
                  role: { in: [UserRole.SERVANT, UserRole.SERVANT_PREP] },
                },
              },
              select: {
                user: {
                  select: { id: true, name: true, email: true, profileImageUrl: true },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        owner: { select: { id: true, name: true, profileImageUrl: true } },
        resources: { orderBy: { sortOrder: "asc" } },
      },
      orderBy: [{ sundayDate: "asc" }, { class: { name: "asc" } }],
    })

    return NextResponse.json({
      lessons: lessons.map((lesson) => {
        const canAssignOwner = access
          ? canAssignWeeklyLessonOwner(access, lesson.classId)
          : false
        const canEdit = access
          ? canEditWeeklyLesson(access, lesson.classId)
          : false

        return {
          id: lesson.id,
          classId: lesson.classId,
          sundayDate: lesson.sundayDate,
          title: lesson.title,
          ownerId: lesson.ownerId,
          assignedById: lesson.assignedById,
          createdAt: lesson.createdAt,
          updatedAt: lesson.updatedAt,
          class: {
            id: lesson.class.id,
            name: lesson.class.name,
            level: lesson.class.level,
          },
          owner: lesson.owner,
          resources: lesson.resources,
          status: getWeeklyLessonStatus(lesson.ownerId, lesson.resources.length),
          canEdit,
          canAssignOwner,
          eligibleOwners: canAssignOwner
            ? lesson.class.assignments.map((assignment) => assignment.user)
            : [],
        }
      }),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
