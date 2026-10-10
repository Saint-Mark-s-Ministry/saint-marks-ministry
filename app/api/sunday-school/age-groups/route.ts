import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canAdministerSundaySchool } from "@/lib/roles"
import { getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { assertLevelsUnclaimed, isValidLevel } from "@/lib/sunday-school-class"
import { SundaySchoolLevel } from "@prisma/client"

// Sunday School mode: age groups (Elementary / Middle / High).
// A class's band is whichever age group lists its grade level — there is no
// ageGroupId on the class, so moving a level between bands re-parents its
// classes automatically.

// GET /api/sunday-school/age-groups - List age groups
export async function GET() {
  try {
    const user = await requireAuth()

    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const [ageGroups, activeAcademicYear] = await Promise.all([
      prisma.sundaySchoolAgeGroup.findMany({
        include: {
          overseer: { select: { id: true, name: true, profileImageUrl: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
      }),
    ])

    // Load assignments directly by ageGroupId instead of through the Prisma
    // composite relation. Legacy age groups have sundaySchoolYearId = NULL,
    // and SQL cannot join NULL composite-key parts even though ageGroupId is
    // valid. Duplicate detection and the organization chart already use this
    // direct active-year lookup.
    const assignments = activeAcademicYear && ageGroups.length > 0
      ? await prisma.sundaySchoolServantAssignment.findMany({
          where: {
            academicYearId: activeAcademicYear.id,
            ageGroupId: { in: ageGroups.map(group => group.id) },
            endedAt: null,
          },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        })
      : []

    return NextResponse.json(
      ageGroups.map(group => ({
        ...group,
        assignments: assignments.filter(assignment => assignment.ageGroupId === group.id),
        canCoordinate: access.isAdmin || access.coordinatorAgeGroupIds.has(group.id),
      }))
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/age-groups - Create an age group (SUPER_ADMIN only)
// Body: { name, levels: SundaySchoolLevel[], sortOrder? }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    if (!canAdministerSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, levels, sortOrder, overseerId, isElementary } = body

        if (overseerId !== undefined && overseerId !== null) {
          if (typeof overseerId !== 'string' || !overseerId) return NextResponse.json({ error: 'Invalid priest overseer' }, { status: 400 })
          const priest = await prisma.user.findFirst({ where: { id: overseerId, role: 'PRIEST', isDisabled: false }, select: { id: true } })
          if (!priest) return NextResponse.json({ error: 'Choose an active priest as overseer' }, { status: 400 })
        }

    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }
    if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isValidLevel)) {
      return NextResponse.json(
        { error: "At least one valid grade level is required" },
        { status: 400 }
      )
    }

    const existingGroups = await prisma.sundaySchoolAgeGroup.findMany({
      select: { id: true, name: true, levels: true },
    })

    const conflict = assertLevelsUnclaimed(levels as SundaySchoolLevel[], existingGroups)
    if (conflict) {
      return NextResponse.json({ error: conflict }, { status: 409 })
    }

    if (isElementary) {
      const existingElementary = await prisma.sundaySchoolAgeGroup.findFirst({
        where: { isElementary: true, sundaySchoolYearId: null },
        select: { id: true },
      })
      if (existingElementary) {
        return NextResponse.json({ error: "Only one Elementary age group is allowed" }, { status: 409 })
      }
    }

    const created = await prisma.sundaySchoolAgeGroup.create({
      data: {
        name: String(name).trim(),
                overseerId: overseerId ?? null,
        levels: levels as SundaySchoolLevel[],
        sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
        isElementary: Boolean(isElementary),
      },
    })

    return NextResponse.json(created, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
