import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { handleApiError } from "@/lib/api-utils"
import { canAdministerSundaySchool } from "@/lib/roles"

// Sunday School mode: a SUPER_ADMIN's own view preference — which classes
// they default to seeing on the Classes screen, instead of every class in
// the ministry. This is never consulted for authorization; a SUPER_ADMIN
// still sees and may act on every class regardless of what's pinned here.

// GET /api/sunday-school/pinned-classes
export async function GET() {
  try {
    const user = await requireAuth()
    if (!canAdministerSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { pinnedSundaySchoolClassIds: true },
    })

    return NextResponse.json({ classIds: record?.pinnedSundaySchoolClassIds ?? [] })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// PUT /api/sunday-school/pinned-classes
// Body: { classIds: string[] }
export async function PUT(request: Request) {
  try {
    const user = await requireAuth()
    if (!canAdministerSundaySchool(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body: unknown = await request.json()
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Enter a list of class ids" }, { status: 400 })
    }
    const { classIds } = body as Record<string, unknown>
    if (!Array.isArray(classIds) || classIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "classIds must be an array of strings" }, { status: 400 })
    }

    // Only ever store ids that are real, current classes — never trust the
    // client's list outright, and never let a stale/garbage id linger.
    const requested = Array.from(new Set(classIds as string[]))
    const realClasses = requested.length
      ? await prisma.sundaySchoolClass.findMany({
          where: { id: { in: requested } },
          select: { id: true },
        })
      : []
    const validIds = realClasses.map((c) => c.id)

    await prisma.user.update({
      where: { id: user.id },
      data: { pinnedSundaySchoolClassIds: validIds },
    })

    return NextResponse.json({ classIds: validIds })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
