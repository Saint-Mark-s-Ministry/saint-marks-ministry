import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canAdministerSundaySchool } from "@/lib/roles"
import { assertLevelsUnclaimed, isValidLevel } from "@/lib/sunday-school-class"
import { SundaySchoolLevel } from "@prisma/client"

// Sunday School mode: edit or remove one age group. SUPER_ADMIN only —
// redrawing the bands changes who coordinates what.

// PATCH /api/sunday-school/age-groups/[id]
// Body: { name?, levels?, sortOrder?, isActive? }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (!canAdministerSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { name, levels, sortOrder, isActive } = body

    const updateData: Record<string, unknown> = {}

        if (body.overseerId !== undefined) {
          if (body.overseerId !== null && (typeof body.overseerId !== 'string' || !body.overseerId)) {
            return NextResponse.json({ error: 'Invalid priest overseer' }, { status: 400 })
          }
          if (body.overseerId !== null) {
            const priest = await prisma.user.findFirst({ where: { id: body.overseerId, role: 'PRIEST', isDisabled: false }, select: { id: true } })
            if (!priest) return NextResponse.json({ error: 'Choose an active priest as overseer' }, { status: 400 })
          }
          updateData.overseerId = body.overseerId
        }

    if (name !== undefined) {
      if (!String(name).trim()) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 })
      }
      updateData.name = String(name).trim()
    }

    if (levels !== undefined) {
      if (!Array.isArray(levels) || levels.length === 0 || !levels.every(isValidLevel)) {
        return NextResponse.json(
          { error: "At least one valid grade level is required" },
          { status: 400 }
        )
      }

      const others = await prisma.sundaySchoolAgeGroup.findMany({
        where: { id: { not: id } },
        select: { id: true, name: true, levels: true },
      })
      const conflict = assertLevelsUnclaimed(levels as SundaySchoolLevel[], others)
      if (conflict) {
        return NextResponse.json({ error: conflict }, { status: 409 })
      }

      updateData.levels = levels as SundaySchoolLevel[]
    }

    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder) || 0
    if (isActive !== undefined) updateData.isActive = Boolean(isActive)
    if (body.isElementary !== undefined) {
      const nextIsElementary = Boolean(body.isElementary)
      if (nextIsElementary) {
        const current = await prisma.sundaySchoolAgeGroup.findUnique({
          where: { id },
          select: { sundaySchoolYearId: true },
        })
        if (!current) return NextResponse.json({ error: "Age group not found" }, { status: 404 })
        const existingElementary = await prisma.sundaySchoolAgeGroup.findFirst({
          where: {
            id: { not: id },
            isElementary: true,
            sundaySchoolYearId: current.sundaySchoolYearId,
          },
          select: { id: true },
        })
        if (existingElementary) {
          return NextResponse.json({ error: "Only one Elementary age group is allowed" }, { status: 409 })
        }
      }
      updateData.isElementary = nextIsElementary
    }

    const updated = await prisma.sundaySchoolAgeGroup.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/sunday-school/age-groups/[id]
// Its coordinator assignments cascade; the classes themselves are untouched
// and simply become unbanded until a group claims their levels again.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (!canAdministerSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.sundaySchoolAgeGroup.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
