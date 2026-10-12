import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { SundaySchoolGrade } from "@prisma/client"
import { canManageSundaySchool } from "@/lib/roles"
import { rotationGradeForClassLevel } from "@/lib/sunday-school-utils"
import { ROTATION_WEEKS } from "@/lib/rotation-forms"

// PATCH /api/sunday-school/assignments/[id] - Update an assignment
// Body: { classId?, grade?, totalWeeks?, startDate?, isActive? } — a class sets the grade
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (!canManageSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { classId, totalWeeks, startDate, isActive } = body
    let { grade } = body
    const current = await prisma.sundaySchoolAssignment.findUnique({ where: { id }, include: { logs: true, rotationForm: true } })
    if (!current) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    if (isActive === false && current.isActive && current.rotationForm?.status !== 'APPROVED') {
      return NextResponse.json({ error: "Approve the signed four-week form to finish this rotation" }, { status: 409 })
    }
    if (isActive === true && !current.isActive) return NextResponse.json({ error: "Completed rotations cannot be reopened" }, { status: 409 })

    const updateData: Record<string, unknown> = {}
    if (classId !== undefined) {
      if (classId) {
        const ssClass = await prisma.sundaySchoolClass.findFirst({
          where: { id: classId, isActive: true },
          select: { level: true },
        })
        if (!ssClass) {
          return NextResponse.json({ error: "Sunday School class not found" }, { status: 400 })
        }
        grade = rotationGradeForClassLevel(ssClass.level)
      }
      updateData.classId = classId || null
    }
    if (grade !== undefined) {
      const validGrades = Object.values(SundaySchoolGrade)
      if (!validGrades.includes(grade as SundaySchoolGrade)) {
        return NextResponse.json(
          { error: `Invalid grade. Must be one of: ${validGrades.join(", ")}` },
          { status: 400 }
        )
      }
      updateData.grade = grade as SundaySchoolGrade
    }
    if (totalWeeks !== undefined) {
      if (totalWeeks !== ROTATION_WEEKS) {
        return NextResponse.json(
          { error: "Each rotation is four weeks" },
          { status: 400 }
        )
      }
      updateData.totalWeeks = totalWeeks
    }
    if (startDate !== undefined) {
      const parsed = new Date(startDate)
      if (isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid startDate format" },
          { status: 400 }
        )
      }
      parsed.setUTCHours(0, 0, 0, 0) // a date-only value is UTC midnight; keep that day
      updateData.startDate = parsed
    }
    if (isActive !== undefined) updateData.isActive = isActive

    const changesEvidence = (updateData.classId !== undefined && updateData.classId !== current.classId)
      || (updateData.grade !== undefined && updateData.grade !== current.grade)
      || (updateData.totalWeeks !== undefined && updateData.totalWeeks !== current.totalWeeks)
      || (updateData.startDate instanceof Date && updateData.startDate.getTime() !== current.startDate.getTime())
    if (changesEvidence && (current.logs.length > 0 || current.rotationForm)) {
      return NextResponse.json({ error: "A rotation with attendance or a form cannot be reassigned. Approve its form to advance" }, { status: 409 })
    }

    const changed = await prisma.sundaySchoolAssignment.updateMany({
      where: { id, isActive: current.isActive, updatedAt: current.updatedAt, ...(changesEvidence ? { logs: { none: {} }, rotationForm: null } : {}) },
      data: updateData,
    })
    if (changed.count !== 1) return NextResponse.json({ error: "The rotation changed. Refresh before editing" }, { status: 409 })
    const assignment = await prisma.sundaySchoolAssignment.findUniqueOrThrow({
      where: { id },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            name: true,
          },
        },
        class: { select: { id: true, name: true } },
        assigner: {
          select: {
            id: true,
            name: true,
          },
        },
        logs: {
          orderBy: { weekNumber: "asc" },
        },
      },
    })

    return NextResponse.json(assignment)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update assignment" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}

// DELETE /api/sunday-school/assignments/[id] - Delete an assignment (cascades logs)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (!canManageSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const current = await prisma.sundaySchoolAssignment.findUnique({ where: { id }, include: { _count: { select: { logs: true } }, rotationForm: { select: { id: true } } } })
    if (!current) return NextResponse.json({ error: "Assignment not found" }, { status: 404 })
    if (current._count.logs > 0 || current.rotationForm) return NextResponse.json({ error: "Rotations with attendance or uploaded forms must be kept as history" }, { status: 409 })
    const deleted = await prisma.sundaySchoolAssignment.deleteMany({
      where: { id, logs: { none: {} }, rotationForm: null },
    })
    if (deleted.count !== 1) return NextResponse.json({ error: "This rotation has recorded evidence and cannot be deleted" }, { status: 409 })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete assignment" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}
