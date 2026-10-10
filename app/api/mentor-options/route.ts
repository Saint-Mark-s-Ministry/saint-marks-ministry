import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { canAssignMentors, MENTOR_ELIGIBLE_ROLES } from '@/lib/roles'

// Minimal directory used only by mentor-assignment controls. This lets
// Servants Prep servants assign priests without exposing priest accounts in
// the general user-management API.
export async function GET() {
  try {
    const user = await requireAuth()
    if (!canAssignMentors(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const mentors = await prisma.user.findMany({
      where: {
        role: { in: MENTOR_ELIGIBLE_ROLES },
        isDisabled: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        profileImageUrl: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(mentors)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch mentor options' },
      { status: error instanceof Error && error.message === 'Forbidden' ? 403 : 500 }
    )
  }
}
