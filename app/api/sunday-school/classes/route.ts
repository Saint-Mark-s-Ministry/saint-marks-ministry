import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  canCreateClassAtLevel,
  canTakeServantAttendance,
  canViewServantAttendance,
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"
import { isValidLevel } from "@/lib/sunday-school-class"
import { ensureSundaySchoolWeeklyLessons } from "@/lib/sunday-school-lessons"
import { SundaySchoolLevel } from "@prisma/client"

// Sunday School mode: the Sunday School classes themselves.
// Not related to /api/sunday-school/assignments, which tracks async Servants
// Prep students serving their required weeks.

const classInclude = {
  academicYear: { select: { id: true, name: true } },
  assignments: {
    where: { endedAt: null },
    include: {
      user: { select: { id: true, name: true, email: true, profileImageUrl: true } },
    },
  },
  _count: { select: { children: true, sessions: true } },
} as const

// GET /api/sunday-school/classes - List classes
// Query params: ?academicYearId=xxx  ?level=GRADE_3  ?isActive=true
// Scoped to what the caller's assignments cover; admins and priests see all.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const academicYearId = searchParams.get("academicYearId")
    const level = searchParams.get("level")
    const isActive = searchParams.get("isActive")

    const activeAcademicYear = academicYearId
      ? null
      : await prisma.academicYear.findFirst({
          where: { isActive: true },
          select: { id: true },
        })
    const resolvedAcademicYearId = academicYearId ?? activeAcademicYear?.id ?? null

    const access = await getSundaySchoolAccess(user, resolvedAcademicYearId ?? undefined)
    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const where: Record<string, unknown> = {}
    if (resolvedAcademicYearId) where.academicYearId = resolvedAcademicYearId
    if (level) where.level = level as SundaySchoolLevel
    if (isActive !== null && isActive !== undefined) where.isActive = isActive === "true"

    const allowedClassIds = visibleClassFilter(access)
    if (allowedClassIds) {
      where.id = { in: allowedClassIds }
    }

    const classes = await prisma.sundaySchoolClass.findMany({
      where,
      include: classInclude,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    })

    // Tell the client what it may offer for each class, so the UI does not
    // have to re-derive authority (the server still re-checks every write).
    return NextResponse.json(
      classes.map(cls => ({
        ...cls,
        canCoordinate: access.isAdmin || access.coordinatorClassIds.has(cls.id),
        canTakeServantAttendance: canTakeServantAttendance(access, cls.id),
        canViewServantAttendance: canViewServantAttendance(access, cls.id),
        canServe:
          access.isAdmin ||
          (!access.readOnly &&
            (access.servantClassIds.has(cls.id) || access.coordinatorClassIds.has(cls.id))),
      }))
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/classes - Create a class
// SUPER_ADMIN anywhere; an age-group coordinator within their own band.
// Body: { name, level, classroom?, academicYearId? }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    const body = await request.json()
    const { name, level } = body
    const { classroom } = body
    if (classroom !== undefined && classroom !== null && (typeof classroom !== "string" || classroom.trim().length > 200)) {
      return NextResponse.json({ error: "Classroom must be text with at most 200 characters" }, { status: 400 })
    }
    let { academicYearId } = body
    let { sundaySchoolYearId } = body

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Class name is required" }, { status: 400 })
    }
    if (!isValidLevel(level)) {
      return NextResponse.json({ error: "A valid grade level is required" }, { status: 400 })
    }

    const targetSundaySchoolYear = await prisma.sundaySchoolYear.findFirst({
      where: sundaySchoolYearId
        ? { id: sundaySchoolYearId, status: "OPEN" }
        : { status: "OPEN" },
      select: { id: true, name: true },
    })
    if (!targetSundaySchoolYear) {
      return NextResponse.json(
        { error: "No matching open Sunday School year. Open a year before adding classes." },
        { status: 409 }
      )
    }
    sundaySchoolYearId = targetSundaySchoolYear.id

    // Keep the legacy academic-year key aligned with the operational Sunday
    // School year. A mismatch makes the classes page and dashboard select
    // different records and makes every assignment appear to disappear when
    // the academic year changes.
    const targetAcademicYear = await prisma.academicYear.findFirst({
      where: academicYearId
        ? { id: academicYearId }
        : { name: targetSundaySchoolYear.name },
      select: { id: true, name: true },
    })
    if (!targetAcademicYear) {
      return NextResponse.json(
        {
          error: `Create the ${targetSundaySchoolYear.name} academic year before adding Sunday School classes.`,
        },
        { status: 409 }
      )
    }
    if (targetAcademicYear.name !== targetSundaySchoolYear.name) {
      return NextResponse.json(
        { error: "The academic year and open Sunday School year must match" },
        { status: 409 }
      )
    }
    academicYearId = targetAcademicYear.id

    const access = await getSundaySchoolAccess(user, academicYearId)
    if (!canCreateClassAtLevel(access, level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const trimmedName = String(name).trim()
    const requestedSectionName = String(body.sectionName ?? "").trim()

    const duplicateName = await prisma.sundaySchoolClass.findFirst({
      where: { academicYearId, name: trimmedName },
      select: { id: true },
    })
    if (duplicateName) {
      return NextResponse.json(
        { error: "A class with this name already exists for that academic year" },
        { status: 409 }
      )
    }

    // The first class in a grade is its General section. Additional classes
    // use their class name as the section key, so one grade can have multiple
    // classes without all of them colliding on the hidden General default.
    const existingClassAtLevel = requestedSectionName
      ? null
      : await prisma.sundaySchoolClass.findFirst({
          where: { sundaySchoolYearId, level },
          select: { id: true },
        })
    const sectionName = requestedSectionName || (existingClassAtLevel ? trimmedName : "General")

    const duplicateSection = await prisma.sundaySchoolClass.findFirst({
      where: {
        sundaySchoolYearId,
        level,
        sectionName,
      },
      select: { id: true },
    })
    if (duplicateSection) {
      return NextResponse.json(
        { error: "A class with this section already exists for that grade" },
        { status: 409 }
      )
    }

    const created = await prisma.$transaction(async (tx) => {
      const newClass = await tx.sundaySchoolClass.create({
        data: {
          name: trimmedName,
          classroom: classroom?.trim() || null,
          level,
          academicYearId,
          sundaySchoolYearId,
          sectionName,
          status: "ACTIVE",
        },
        include: classInclude,
      })
      await ensureSundaySchoolWeeklyLessons({ classIds: [newClass.id], db: tx })
      return newClass
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
