import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'

// A deliberately small birthday-only view. Guardian and family contact details
// stay out of this response because the birthday page does not need them.
export async function GET() {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowedClassIds = visibleClassFilter(access)
    const children = await prisma.sundaySchoolChild.findMany({
      where: {
        isActive: true,
        birthDate: { not: null },
        ...(allowedClassIds ? { classId: { in: allowedClassIds } } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        level: true,
        classId: true,
        birthDate: true,
        photoUrl: true,
        class: { select: { id: true, name: true, level: true } },
        user: { select: { profileImageUrl: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    return NextResponse.json(children)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
