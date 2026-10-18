import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewRegistrations } from '@/lib/roles'
import { Prisma, RegistrationStatus } from '@prisma/client'
import { withRegistrationNameMatches } from '@/lib/registration-name-matches'

/**
 * GET /api/registration/submissions
 * List registration submissions with optional filtering and pagination
 * Auth: SUPER_ADMIN, SERVANT_PREP, PRIEST
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canViewRegistrations(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status') as RegistrationStatus | null
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const skip = (page - 1) * limit

    // Build where clause
    const where: Prisma.RegistrationSubmissionWhereInput = {}
    if (statusFilter && Object.values(RegistrationStatus).includes(statusFilter)) {
      where.status = statusFilter
    }

    // Get total count
    const totalCount = await prisma.registrationSubmission.count({ where })

    // Get submissions
    const submissions = await prisma.registrationSubmission.findMany({
      where,
      include: {
        inviteCode: {
          select: {
            code: true,
            label: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        createdUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    })

    return NextResponse.json({
      submissions: await withRegistrationNameMatches(submissions),
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error: unknown) {
    console.error('Error fetching registration submissions:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
