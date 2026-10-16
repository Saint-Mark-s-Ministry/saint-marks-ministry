import { findOrCreateFatherOfConfession } from '@/lib/father-of-confession'
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { isAdmin } from "@/lib/roles"

// GET /api/fathers-of-confession - List all fathers of confession
export async function GET() {
  try {
    const user = await requireAuth()

    // Only admins can view the list
    if (!isAdmin(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const fathers = await prisma.fatherOfConfession.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        phone: true,
        church: true,
        isActive: true,
        _count: {
          select: { students: true }
        }
      }
    })

    return NextResponse.json(fathers)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch fathers of confession" },
      { status: 500 }
    )
  }
}

// POST /api/fathers-of-confession - Create a new father of confession
export async function POST(request: Request) {
  try {
    const user = await requireAuth()

    if (!isAdmin(user.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, phone, church } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      )
    }

    const { father, created } = await findOrCreateFatherOfConfession(prisma, {
      name, phone: phone?.trim() || null, church: church?.trim() || null,
    })

    return NextResponse.json(father, { status: created ? 201 : 200 })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create father of confession" },
      { status: 500 }
    )
  }
}
