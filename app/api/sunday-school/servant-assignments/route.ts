import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canBeAssignedToSundaySchool } from "@/lib/roles"
import {
  canCoordinateAgeGroup,
  canCoordinateClass,
  getSundaySchoolAccess,
  visibleClassFilter,
} from "@/lib/sunday-school-access"
import {
  RoleGrantSource,
  RoleTag,
  SundaySchoolAuthority,
  type Prisma,
} from "@prisma/client"

// Sunday School mode: who serves or coordinates what.
//
// Named "servant-assignments" to stay clear of /api/sunday-school/assignments,
// which is the unrelated prep-side route tracking async students serving their
// required weeks.
//
// An assignment names exactly one scope — a class or an age group — for one
// academic year. This is the only thing that grants Sunday School authority;
// no role does. Assigning into a scope requires coordinating that scope.

async function resolveAcademicYearId(requested?: string | null): Promise<string | null> {
  if (requested) return requested
  const active = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
  return active?.id ?? null
}

async function ensureSundaySchoolServantTag(
  tx: Prisma.TransactionClient,
  userId: string,
  grantedById: string
) {
  // The database has a partial unique index for active user/tag pairs. Using
  // createMany + skipDuplicates keeps concurrent class assignments idempotent
  // while still creating a fresh grant after a historical one was revoked.
  await tx.userRoleAssignment.createMany({
    data: [{
      userId,
      tag: RoleTag.SUNDAY_SCHOOL_SERVANT,
      source: RoleGrantSource.SYSTEM,
      grantedById,
      note: "Granted automatically with a Sunday School servant assignment",
    }],
    skipDuplicates: true,
  })
}

// GET /api/sunday-school/assignments
// Query params: ?classId=xxx  ?ageGroupId=xxx  ?userId=xxx  ?academicYearId=xxx
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const classId = searchParams.get("classId")
    const ageGroupId = searchParams.get("ageGroupId")
    const userId = searchParams.get("userId")
    const academicYearId = await resolveAcademicYearId(searchParams.get("academicYearId"))

    const access = await getSundaySchoolAccess(user, academicYearId ?? undefined)
    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const where: Record<string, unknown> = { endedAt: null }
    if (academicYearId) where.academicYearId = academicYearId
    if (classId) where.classId = classId
    if (ageGroupId) where.ageGroupId = ageGroupId
    if (userId) where.userId = userId

    // Limit class-scoped rows to classes this user can see. Band-scoped rows
    // are visible to anyone with access — knowing who runs High School is not
    // sensitive, and coordinators need it to know whom to ask.
    const allowedClassIds = visibleClassFilter(access)
    if (allowedClassIds) {
      where.OR = [{ classId: { in: allowedClassIds } }, { classId: null }]
    }

    const assignments = await prisma.sundaySchoolServantAssignment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true, profileImageUrl: true } },
        class: { select: { id: true, name: true, level: true } },
        ageGroup: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    })

    return NextResponse.json(assignments)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/assignments - Assign someone to a class or a band
// Body: { userId, authority, classId? | ageGroupId?, academicYearId? }
export async function POST(request: Request) {
  try {
    const actor = await requireAuth()

    const body = await request.json()
    const { userId, authority, classId, ageGroupId } = body

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 })
    }
    if (!Object.values(SundaySchoolAuthority).includes(authority)) {
      return NextResponse.json(
        { error: `authority must be one of: ${Object.values(SundaySchoolAuthority).join(", ")}` },
        { status: 400 }
      )
    }
    if (Boolean(classId) === Boolean(ageGroupId)) {
      return NextResponse.json(
        { error: "An assignment names exactly one scope: either a class or an age group" },
        { status: 400 }
      )
    }
    if (ageGroupId && authority !== SundaySchoolAuthority.COORDINATOR) {
      return NextResponse.json(
        { error: "An age-group assignment is always a coordinator" },
        { status: 400 }
      )
    }

    const academicYearId = await resolveAcademicYearId(body.academicYearId)
    if (!academicYearId) {
      return NextResponse.json(
        { error: "No active academic year. Create one before assigning servants." },
        { status: 400 }
      )
    }

    const access = await getSundaySchoolAccess(actor, academicYearId)
    let sundaySchoolYearId: string | null = null

    if (classId) {
      const target = await prisma.sundaySchoolClass.findUnique({
        where: { id: classId },
        select: { id: true, academicYearId: true, sundaySchoolYearId: true, status: true },
      })
      if (!target) {
        return NextResponse.json({ error: "Class not found" }, { status: 404 })
      }
      if (target.academicYearId !== academicYearId) {
        return NextResponse.json(
          { error: "That class belongs to a different academic year" },
          { status: 400 }
        )
      }
      if (target.status !== "ACTIVE") {
        return NextResponse.json({ error: "Archived classes cannot receive assignments" }, { status: 400 })
      }
      if (!canCoordinateClass(access, classId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      sundaySchoolYearId = target.sundaySchoolYearId
    } else {
      const target = await prisma.sundaySchoolAgeGroup.findUnique({
        where: { id: ageGroupId },
        select: { id: true, sundaySchoolYearId: true, status: true },
      })
      if (!target) {
        return NextResponse.json({ error: "Age group not found" }, { status: 404 })
      }
      if (target.status !== "ACTIVE") {
        return NextResponse.json({ error: "Archived age groups cannot receive assignments" }, { status: 400 })
      }
      // Only a super admin appoints an age-group coordinator; a band
      // coordinator cannot appoint their own peers.
      if (!access.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      sundaySchoolYearId = target.sundaySchoolYearId
    }

    const assignee = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isDisabled: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
        },
      },
    })
    if (!assignee) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (assignee.isDisabled) {
      return NextResponse.json({ error: "Disabled users cannot be assigned" }, { status: 400 })
    }
    if (!canBeAssignedToSundaySchool(
      assignee.role,
      assignee.roleAssignments.map((assignment) => assignment.tag)
    )) {
      return NextResponse.json(
        {
          error:
            "Only Sunday School Servant, Mentor, Servants Prep Servant, or tagged Super Admin accounts can be assigned",
        },
        { status: 400 }
      )
    }

    // Postgres unique indexes treat NULLs as distinct, so the duplicate check
    // has to be explicit rather than a constraint.
    const existing = await prisma.sundaySchoolServantAssignment.findFirst({
      where: {
        userId,
        academicYearId,
        classId: classId ?? null,
        ageGroupId: ageGroupId ?? null,
        endedAt: null,
      },
    })
    if (existing) {
      if (existing.authority === authority) {
        return NextResponse.json(
          { error: "That person already has this assignment" },
          { status: 409 }
        )
      }
      // Authority changes close the old row and create a new row so the audit
      // history cannot be overwritten.
      const promoted = await prisma.$transaction(async (tx) => {
        await tx.sundaySchoolServantAssignment.update({
          where: { id: existing.id },
          data: {
            endedAt: new Date(),
            endedById: actor.id,
            endReason: "Authority changed",
          },
        })
        await ensureSundaySchoolServantTag(tx, userId, actor.id)
        return tx.sundaySchoolServantAssignment.create({
          data: {
            userId,
            academicYearId,
            sundaySchoolYearId,
            authority,
            classId: classId ?? null,
            ageGroupId: ageGroupId ?? null,
            assignedBy: actor.id,
          },
          include: {
            user: { select: { id: true, name: true, email: true, role: true, profileImageUrl: true } },
            class: { select: { id: true, name: true, level: true } },
            ageGroup: { select: { id: true, name: true } },
          },
        })
      })
      return NextResponse.json(promoted)
    }

    const created = await prisma.$transaction(async (tx) => {
      await ensureSundaySchoolServantTag(tx, userId, actor.id)
      return tx.sundaySchoolServantAssignment.create({
        data: {
          userId,
          academicYearId,
          sundaySchoolYearId,
          authority,
          classId: classId ?? null,
          ageGroupId: ageGroupId ?? null,
          assignedBy: actor.id,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, profileImageUrl: true } },
          class: { select: { id: true, name: true, level: true } },
          ageGroup: { select: { id: true, name: true } },
        },
      })
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/sunday-school/assignments?id=xxx - Remove an assignment
export async function DELETE(request: Request) {
  try {
    const actor = await requireAuth()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 })
    }

    const assignment = await prisma.sundaySchoolServantAssignment.findUnique({
      where: { id },
      select: { id: true, classId: true, ageGroupId: true, academicYearId: true, endedAt: true },
    })
    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    }
    if (assignment.endedAt) {
      return NextResponse.json({ success: true, action: "already-ended" })
    }

    const access = await getSundaySchoolAccess(actor, assignment.academicYearId)

    const allowed = assignment.classId
      ? canCoordinateClass(access, assignment.classId)
      : assignment.ageGroupId
        ? access.isAdmin && canCoordinateAgeGroup(access, assignment.ageGroupId)
        : false

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.sundaySchoolServantAssignment.update({
      where: { id },
      data: {
        endedAt: new Date(),
        endedById: actor.id,
        endReason: "Removed from assignment",
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
