import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { canViewClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { getTodayDateInputValue } from '@/lib/sunday-school-class'
import { buildIndividualAttendance } from '@/lib/sunday-school-individual-attendance'

// Sunday School ministry: individual history within one visible active class.
// Uses the compatibility class resolver, matching the attendance editor, until
// the durable ministry-year assignment backfill has been reconciled.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const authorization = await getAuthorizationContext(user.id)
    const principal = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, role: true } })
    if (!principal) throw new Error("Unauthorized")
    const access = await getSundaySchoolAccess(principal)
    const classId = new URL(request.url).searchParams.get('classId')
    if (!classId) return NextResponse.json({ error: 'Class is required' }, { status: 400 })
    if (authorization.disabled || !canViewClass(access, classId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const classroom = await prisma.sundaySchoolClass.findFirst({
      where: { id: classId, isActive: true, academicYear: { isActive: true } },
      select: { id: true, name: true },
    })
    if (!classroom) return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    const through = new Date(`${getTodayDateInputValue()}T00:00:00.000Z`)
    const [roster, sessions, lessons] = await Promise.all([
      prisma.sundaySchoolChild.findMany({
        where: { classId, isActive: true },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.sundaySchoolSession.findMany({
        where: { classId, date: { lte: through } },
        select: {
          date: true,
          attendance: { select: { status: true, child: { select: { id: true, firstName: true, lastName: true } } } },
        },
        orderBy: { date: 'asc' },
      }),
      prisma.sundaySchoolWeeklyLesson.findMany({
        where: { classId, sundayDate: { lte: through } },
        select: { sundayDate: true },
      }),
    ])
    // Historical attendees remain visible, but only their marks in this class.
    // No guardian contact, attendance notes or pastoral notes are returned.
    return NextResponse.json({ classroom, ...buildIndividualAttendance(roster, sessions, lessons.map(lesson => lesson.sundayDate)) })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
