import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { findRegistrationDuplicates } from '@/lib/child-registration-review'

// GET /api/sunday-school/child-registrations/[id]
// The authorized detail/review view: full guardian contact (never masked)
// plus the same duplicate signal the summary queue shows, recomputed here so
// the detail view never depends on a client having kept it from an earlier
// list fetch.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const registrationRequest = await prisma.childRegistrationRequest.findUnique({
      where: { id },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, phone: true } },
        reviewer: { select: { id: true, name: true, email: true } },
        placedClass: { select: { id: true, name: true, level: true } },
      },
    })

    if (!registrationRequest) {
      return NextResponse.json({ error: 'Registration request not found' }, { status: 404 })
    }

    if (!access.isAdmin && !access.coordinatorLevels.has(registrationRequest.intendedLevel)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const duplicateSignal = await findRegistrationDuplicates(registrationRequest)

    return NextResponse.json({ ...registrationRequest, duplicateSignal })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
