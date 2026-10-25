import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { hasViewAsAccess } from '@/lib/view-as-access'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_RESULTS = 50

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const actorId = session.impersonating?.originalId ?? session.user.id
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      role: true,
      canUseViewAs: true,
      mustChangePassword: true,
      isDisabled: true,
      roleAssignments: {
        where: { revokedAt: null },
        select: { tag: true },
      },
    },
  })

  if (!hasViewAsAccess(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')?.trim() ?? ''
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_RESULTS)
    : 20

  const users = await prisma.user.findMany({
    where: {
      isDisabled: false,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      roleAssignments: {
        where: { revokedAt: null },
        select: { tag: true },
        orderBy: { grantedAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
    take: limit,
  })

  return NextResponse.json(users)
}
