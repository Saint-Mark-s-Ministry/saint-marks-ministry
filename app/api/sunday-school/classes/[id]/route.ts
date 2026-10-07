import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import {
  canCoordinateClass,
  canDeleteClass,
  canServeClass,
  canTakeServantAttendance,
  canViewClass,
  canViewServantAttendance,
  getSundaySchoolAccess,
} from "@/lib/sunday-school-access"
import { isValidLevel } from "@/lib/sunday-school-class"
import { ensureSundaySchoolWeeklyLessons } from "@/lib/sunday-school-lessons"

// Sunday School mode: a single Sunday School class.

// GET /api/sunday-school/classes/[id] - Class detail with roster, servants, sessions
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const sundaySchoolClass = await prisma.sundaySchoolClass.findUnique({
      where: { id },
      include: {
        academicYear: { select: { id: true, name: true } },
        assignments: {
          where: { endedAt: null },
          include: {
            user: {
              select: { id: true, name: true, email: true, phone: true, profileImageUrl: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        children: {
          orderBy: [{ isActive: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
        },
        sessions: {
          orderBy: { date: "desc" },
          include: {
            taker: { select: { id: true, name: true } },
            // _count is kept for the web dashboard's own "N marked" display;
            // the mobile app's "N of M present" line (SMM-53) needs the real
            // per-child statuses, not just how many marks exist.
            _count: { select: { attendance: true } },
            attendance: { select: { status: true } },
          },
        },
        weeklyLessons: {
          orderBy: { sundayDate: "desc" },
          include: {
            owner: { select: { id: true, name: true, profileImageUrl: true } },
            resources: { orderBy: { sortOrder: "asc" } },
          },
        },
      },
    })

    if (!sundaySchoolClass) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, sundaySchoolClass.academicYearId)
    if (!canViewClass(access, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return NextResponse.json({
      ...sundaySchoolClass,
      canCoordinate: canCoordinateClass(access, id),
      canServe: canServeClass(access, id),
      canTakeServantAttendance: canTakeServantAttendance(access, id),
      canViewServantAttendance: canViewServantAttendance(access, id),
      canDelete: canDeleteClass(access, sundaySchoolClass.level),
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// PATCH /api/sunday-school/classes/[id] - Update a class
// The class's coordinator, its band coordinator, or SUPER_ADMIN.
// Body: { name?, level?, isActive? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await prisma.sundaySchoolClass.findUnique({
      where: { id },
      select: {
        id: true,
        academicYearId: true,
        sundaySchoolYearId: true,
        level: true,
        name: true,
        sectionName: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, existing.academicYearId)
    if (!canCoordinateClass(access, id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, level, isActive } = body

    const updateData: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: "Class name cannot be empty" }, { status: 400 })
      }
      const trimmedName = String(name).trim()
      if (trimmedName !== existing.name) {
        const duplicate = await prisma.sundaySchoolClass.findFirst({
          where: {
            academicYearId: existing.academicYearId,
            name: trimmedName,
            id: { not: id },
          },
          select: { id: true },
        })
        if (duplicate) {
          return NextResponse.json(
            { error: "A class with this name already exists for that academic year" },
            { status: 409 }
          )
        }

        // Additional classes use their original name as their section key.
        // Keep that generated key aligned when the class is renamed, while
        // preserving explicit section names and the first "General" section.
        if (existing.sectionName === existing.name) {
          const duplicateSection = await prisma.sundaySchoolClass.findFirst({
            where: {
              sundaySchoolYearId: existing.sundaySchoolYearId,
              level: isValidLevel(level) ? level : existing.level,
              sectionName: trimmedName,
              id: { not: id },
            },
            select: { id: true },
          })
          if (duplicateSection) {
            return NextResponse.json(
              { error: "A class with this section already exists for that grade" },
              { status: 409 }
            )
          }
          updateData.sectionName = trimmedName
        }
      }
      updateData.name = trimmedName
    }
    if (level !== undefined) {
      if (!isValidLevel(level)) {
        return NextResponse.json({ error: "Invalid grade level" }, { status: 400 })
      }
      // Moving a class to another level can move it to another band, which
      // would hand it to a different coordinator — so that needs band
      // authority over the destination, not just over the class.
      if (!access.isAdmin && !access.coordinatorLevels.has(level)) {
        return NextResponse.json(
          { error: "You cannot move a class into a grade level outside your age group" },
          { status: 403 }
        )
      }
      updateData.level = level
    }
    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive)
      updateData.status = isActive ? "ACTIVE" : "ARCHIVED"
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.sundaySchoolClass.update({
        where: { id },
        data: updateData,
        include: {
          academicYear: { select: { id: true, name: true } },
          assignments: {
            where: { endedAt: null },
            include: { user: { select: { id: true, name: true, email: true, profileImageUrl: true } } },
          },
          _count: { select: { children: true, sessions: true } },
        },
      })
      if (isActive === true) {
        await ensureSundaySchoolWeeklyLessons({ classIds: [id], db: tx })
      }
      return changed
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/sunday-school/classes/[id] - Permanently delete a class.
// SUPER_ADMIN or the coordinator of the class's age group. Coordinating the
// class itself is not enough. Children are preserved and become unassigned;
// class-specific history is removed with the class.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const existing = await prisma.sundaySchoolClass.findUnique({
      where: { id },
      select: {
        id: true,
        level: true,
        academicYearId: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 })
    }

    const access = await getSundaySchoolAccess(user, existing.academicYearId)
    if (!canDeleteClass(access, existing.level)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.$transaction(async (tx) => {
      // Priest notes restrict deletion of their visitation, so remove them
      // explicitly before the class's visitation history.
      await tx.sundaySchoolPriestNote.deleteMany({
        where: { visitation: { classId: id } },
      })

      await tx.sundaySchoolVisitation.deleteMany({ where: { classId: id } })

      // Sessions own child and servant attendance and cascade-delete it. Any
      // remaining attendance or visitation rows linked to one of this class's
      // historical placements are detached before those placements are
      // removed, guarding against legacy cross-class data.
      await tx.sundaySchoolSession.deleteMany({ where: { classId: id } })
      await tx.sundaySchoolChildAttendance.updateMany({
        where: { placement: { classId: id } },
        data: { placementId: null },
      })
      await tx.sundaySchoolVisitation.updateMany({
        where: { placement: { classId: id } },
        data: { placementId: null },
      })

      await tx.sundaySchoolClassPlacement.deleteMany({ where: { classId: id } })
      await tx.sundaySchoolServantAssignment.deleteMany({ where: { classId: id } })
      await tx.sundaySchoolRosterImport.deleteMany({ where: { classId: id } })

      // Children and pending registration requests use SET NULL foreign keys;
      // weekly lessons cascade. The class row itself is therefore truly gone.
      await tx.sundaySchoolClass.delete({ where: { id } })
    })

    return NextResponse.json({ success: true, action: "deleted" })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
