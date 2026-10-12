import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { UserRole, SundaySchoolLogStatus } from "@prisma/client"
import { isAdmin } from "@/lib/roles"
import { getMentorStudentIds } from "@/lib/api-utils"

// GET /api/sunday-school/logs - List logs with filters
// Query params:
//   ?assignmentId=xxx - filter by assignment
//   ?studentId=xxx - filter by student
//   ?status=VERIFIED - filter by status
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const assignmentId = searchParams.get("assignmentId")
    const studentId = searchParams.get("studentId")
    const status = searchParams.get("status")

    const where: Record<string, unknown> = {}
    if (assignmentId) where.assignmentId = assignmentId
    if (status) where.status = status as SundaySchoolLogStatus

    // Role-based filtering
    if (user.role === UserRole.STUDENT) {
      where.assignment = { studentId: user.id }
    } else if (user.role === UserRole.MENTOR) {
      const menteeIds = await getMentorStudentIds(user.id, user.role)
      if (menteeIds) {
        where.assignment = { studentId: { in: menteeIds } }
      }
    } else if (!isAdmin(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // If a studentId filter is provided (and user has access), scope to that student
    if (studentId) {
      if (user.role === UserRole.STUDENT && studentId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      if (user.role === UserRole.MENTOR) {
        const menteeIds = await getMentorStudentIds(user.id, user.role)
        if (!menteeIds?.includes(studentId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      where.assignment = { ...(where.assignment as Record<string, unknown> || {}), studentId }
    }

    const logs = await prisma.sundaySchoolLog.findMany({
      where,
      include: {
        assignment: {
          include: {
            student: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        code: {
          select: {
            id: true,
            code: true,
            grade: true,
          },
        },
        marker: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ weekOf: "desc" }],
    })

    return NextResponse.json(logs)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch logs" },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 }
    )
  }
}

// Weekly codes have been replaced by human-reviewed four-week rotation forms.
export async function POST() {
  try {
    await requireAuth()
    return NextResponse.json({ error: "Weekly attendance codes are no longer used. Upload your signed four-week rotation form." }, { status: 410 })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit attendance" }, { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 })
  }
}
