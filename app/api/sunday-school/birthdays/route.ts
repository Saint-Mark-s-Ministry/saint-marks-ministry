import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getSundaySchoolAccess, visibleClassFilter } from '@/lib/sunday-school-access'

// GET /api/sunday-school/birthdays
// A birthday-only view for the Sunday School birthday list. Limited to the
// classes the caller can read. Guardian, family, and phone fields are never
// selected, and neither are photos.
export async function GET() {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!access.canRead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowedClassIds = visibleClassFilter(access)
    const activeYear = await prisma.academicYear.findFirst({
      where: { isActive: true },
      select: { id: true },
    })

    const children = await prisma.sundaySchoolChild.findMany({
      where: {
        isActive: true,
        birthDate: { not: null },
        // Scoped to the active academic year's classes, not just class
        // access — an admin/priest's "all" access otherwise spans every
        // class ever created, across every past year.
        class: {
          academicYearId: activeYear?.id ?? '__no_active_academic_year__',
          ...(allowedClassIds ? { id: { in: allowedClassIds } } : {}),
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        birthDate: true,
        classId: true,
        class: { select: { id: true, name: true, level: true } },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    })

    return NextResponse.json(children)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
