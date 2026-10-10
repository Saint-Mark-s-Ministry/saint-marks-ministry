import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { findRegistrationDuplicates, maskGuardianPhone } from '@/lib/child-registration-review'
import { RegistrationStatus } from '@prisma/client'

// GET /api/sunday-school/child-registrations?status=PENDING&summary=1
// Auth: anyone with Sunday School standing. Admins see every request;
// coordinators see only requests at levels their band covers.
//
// `summary=1` is what the native mobile queue passes: it masks the guardian
// phone to its last 4 digits and drops the guardian email entirely (replaced
// with `hasGuardianEmail`), since a review queue should only need "is there
// more to look at," not the contact itself — that's reserved for a request's
// own detail/review view. Leaving `summary` off (the web dashboard's existing
// call) returns guardian contact exactly as before, unchanged, so nothing
// already deployed there regresses.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? RegistrationStatus.PENDING
    const summary = searchParams.get('summary') === '1'

    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const where: Record<string, unknown> = {}
    if (Object.values(RegistrationStatus).includes(status as RegistrationStatus)) {
      where.status = status
    }
    if (!access.isAdmin) {
      where.intendedLevel = { in: Array.from(access.coordinatorLevels) }
    }

    const requests = await prisma.childRegistrationRequest.findMany({
      where,
      include: {
        submittedBy: { select: { id: true, name: true, email: true, phone: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        placedClass: { select: { id: true, name: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!summary) {
      return NextResponse.json(requests)
    }

    const withSignals = await Promise.all(
      requests.map(async (r) => ({
        ...r,
        guardianPhone: maskGuardianPhone(r.guardianPhone),
        guardianEmail: undefined,
        hasGuardianEmail: !!r.guardianEmail,
        duplicateSignal: await findRegistrationDuplicates(r),
      }))
    )

    return NextResponse.json(withSignals)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
