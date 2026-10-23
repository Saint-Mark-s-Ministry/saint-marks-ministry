import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'
import { sundaySchoolFamilyInclude } from '@/lib/sunday-school-family'

// Sunday School mode: sensitive family contact and sibling data. A viewer
// may see a family when at least one child in it belongs to a visible class.
// Once visible, the response includes every sibling so the roster can show the
// connected family even when the children attend different classes.
export async function GET() {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)

    if (!access.canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowedClassIds = visibleClassFilter(access)
    const families = await prisma.sundaySchoolFamily.findMany({
      where: {
        children: {
          some: allowedClassIds
            ? { classId: { in: allowedClassIds } }
            : {},
        },
      },
      include: sundaySchoolFamilyInclude,
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    })

    return NextResponse.json(families)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
