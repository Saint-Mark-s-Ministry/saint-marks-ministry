import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { getSundaySchoolAccess } from "@/lib/sunday-school-access"
import { sundaySchoolAssignableUserWhere } from "@/lib/sunday-school-assignees"

// Sunday School mode: the people a coordinator may pick from when staffing.
//
// Exists so coordinators do not need /api/users, which is admin-only — a
// coordinator is often a plain SERVANT. Returns just enough to identify
// someone in a picker, and only for the roles that may be assigned.

// GET /api/sunday-school/assignable-servants?search=name
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const access = await getSundaySchoolAccess(user)
    // Only someone who can actually staff something needs this list
    const canStaff =
      access.isAdmin || access.coordinatorClassIds.size > 0 || access.coordinatorAgeGroupIds.size > 0
    if (!canStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")

    const servants = await prisma.user.findMany({
      where: {
        ...sundaySchoolAssignableUserWhere,
        ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
      },
      select: { id: true, name: true, email: true, role: true, profileImageUrl: true },
      orderBy: { name: "asc" },
      take: 100,
    })

    return NextResponse.json(servants)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
