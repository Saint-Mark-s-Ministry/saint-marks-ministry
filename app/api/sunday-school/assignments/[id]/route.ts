import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { SundaySchoolGrade } from "@prisma/client"
import { canManageSundaySchool } from "@/lib/roles"
import { rotationGradeForClassLevel } from "@/lib/sunday-school-utils"

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
      if (totalWeeks < 1 || totalWeeks > 52) {
        return NextResponse.json(
          { error: "totalWeeks must be between 1 and 52" },
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

    const assignment = await prisma.sundaySchoolAssignment.update({
      where: { id },
      data: updateData,
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

    // The schema has onDelete: Cascade for logs, so deleting assignment removes logs too
    await prisma.sundaySchoolAssignment.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete assignment" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}
