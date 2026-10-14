import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { canReviewServantApplications } from '@/lib/roles'
import { RegistrationStatus } from '@prisma/client'
import { withRegistrationNameMatches } from '@/lib/registration-name-matches'

// GET /api/servant-applications?status=PENDING|APPROVED|REJECTED
// Auth: SUPER_ADMIN only — servant accounts are SUPER_ADMIN-created, so
// there's no SERVANT_PREP view-only tier for this queue.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    if (!canReviewServantApplications(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where =
      status && Object.values(RegistrationStatus).includes(status as RegistrationStatus)
        ? { status: status as RegistrationStatus }
        : {}

    const applications = await prisma.servantApplication.findMany({
      where,
      select: {
        id: true,
        status: true,
        email: true,
        fullName: true,
        createdUserId: true,
        phone: true,
        motivation: true,
        createdAt: true,
        reviewedAt: true,
        reviewNote: true,
        reviewer: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(
      (await withRegistrationNameMatches(applications)).map(({ motivation, ...application }) => ({
        ...application,
        currentGrade: motivation,
      }))
    )
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
