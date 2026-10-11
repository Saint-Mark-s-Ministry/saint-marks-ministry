import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canCoordinateClass, getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { sundaySchoolAssignableUserWhere } from "@/lib/sunday-school-assignees"
import { ensureSundaySchoolWeeklyLessons } from "@/lib/sunday-school-lessons"
import { normalizeSessionDate } from "@/lib/sunday-school-class"
import { buildScheduleAssignments, isValidScheduleMode } from "@/lib/sunday-school-scheduler"

// Sunday School mode: the Lesson Scheduler — bulk-assign a class's still-
// unassigned weekly lessons across its eligible servants, instead of picking
// a teacher one Sunday at a time on the Lessons screen. Coordinator-only:
// this changes many people's assignments at once, unlike the single-lesson
// owner picker (any assigned servant), which this endpoint never touches —
// an already-assigned lesson is always left exactly as it is.

// GET /api/sunday-school/lessons/schedule?classId=X
// A dry-run preview for the picker UI: who's eligible and how many empty
// weeks there are to fill, before the coordinator commits to a run.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const classId = new URL(request.url).searchParams.get("classId")
    if (!classId) {
      return NextResponse.json({ error: "Choose a class" }, { status: 400 })
    }

    const cls = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: { id: true, academicYearId: true },
    })
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, cls.academicYearId)
    if (!canCoordinateClass(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [assignments, emptyWeeksAvailable] = await Promise.all([
      prisma.sundaySchoolServantAssignment.findMany({
        where: { classId, endedAt: null, user: sundaySchoolAssignableUserWhere },
        select: { user: { select: { id: true, name: true, profileImageUrl: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.sundaySchoolWeeklyLesson.count({
        where: { classId, ownerId: null, sundayDate: { gte: normalizeSessionDate(new Date()) } },
      }),
    ])

    const servants = Array.from(new Map(assignments.map((a) => [a.user.id, a.user])).values())

    return NextResponse.json({ servants, emptyWeeksAvailable })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/lessons/schedule
// Body: { classId: string, excludedServantIds?: string[], mode: "one-each" | "fill-year" }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Enter a class, a mode, and who to schedule" }, { status: 400 })
    }
    const { classId, excludedServantIds, mode } = body as Record<string, unknown>
    if (typeof classId !== "string" || !classId.trim()) {
      return NextResponse.json({ error: "Choose a class" }, { status: 400 })
    }
    if (!isValidScheduleMode(mode)) {
      return NextResponse.json({ error: "Choose a schedule mode" }, { status: 400 })
    }
    if (excludedServantIds !== undefined && (!Array.isArray(excludedServantIds) || excludedServantIds.some((id) => typeof id !== "string"))) {
      return NextResponse.json({ error: "excludedServantIds must be an array of strings" }, { status: 400 })
    }
    const excluded = new Set((excludedServantIds as string[] | undefined) ?? [])

    const cls = await prisma.sundaySchoolClass.findUnique({
      where: { id: classId },
      select: { id: true, academicYearId: true },
    })
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, cls.academicYearId)
    if (!canCoordinateClass(access, classId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Self-heal: a class whose weekly lessons haven't been generated yet for
    // the rest of the school year (the Monday cron hasn't run, or this class
    // is new) gets them created now, so there is always something to assign.
    await ensureSundaySchoolWeeklyLessons({ classIds: [classId] })

    const [assignments, emptyLessons] = await Promise.all([
      prisma.sundaySchoolServantAssignment.findMany({
        where: { classId, endedAt: null, user: sundaySchoolAssignableUserWhere },
        select: { user: { select: { id: true, name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      prisma.sundaySchoolWeeklyLesson.findMany({
        where: { classId, ownerId: null, sundayDate: { gte: normalizeSessionDate(new Date()) } },
        select: { id: true, sundayDate: true },
        orderBy: { sundayDate: "asc" },
      }),
    ])

    const pool = Array.from(
      new Map(
        assignments
          .map((a) => a.user)
          .filter((servant) => !excluded.has(servant.id))
          .map((servant) => [servant.id, servant]),
      ).values(),
    )

    if (pool.length === 0) {
      return NextResponse.json(
        { error: "No eligible servants to schedule — everyone assigned to this class is unselected" },
        { status: 400 },
      )
    }

    const assignmentsToMake = buildScheduleAssignments(
      pool,
      emptyLessons.map((l) => ({ id: l.id, sundayDate: l.sundayDate.toISOString() })),
      mode,
    )

    if (assignmentsToMake.length > 0) {
      await prisma.$transaction(
        assignmentsToMake.map((a) =>
          prisma.sundaySchoolWeeklyLesson.update({
            where: { id: a.lessonId },
            data: { ownerId: a.servantId, assignedById: user.id },
          }),
        ),
      )
    }

    return NextResponse.json({
      assigned: assignmentsToMake.map((a) => ({
        lessonId: a.lessonId,
        sundayDate: a.sundayDate,
        servantId: a.servantId,
        servantName: a.servantName,
      })),
      eligibleServants: pool.length,
      emptyWeeksAvailable: emptyLessons.length,
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
