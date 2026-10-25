import { NextResponse } from 'next/server'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { canViewClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { buildBirthdayCalendar, verifyBirthdayCalendarToken } from '@/lib/sunday-school-birthday-calendar'

// Calendar apps cannot use the browser session. The signed, class-scoped link
// authenticates its owner; current DB authority is re-derived before reading any birthdays.
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }
const unavailable = () => new NextResponse('Calendar unavailable', { status: 404, headers })

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const payload = verifyBirthdayCalendarToken(token.replace(/\.ics$/, ''))
    if (!payload) return unavailable()
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, authVersion: true, isDisabled: true, mustChangePassword: true },
    })
    if (!user || user.isDisabled || user.mustChangePassword || user.authVersion !== payload.authVersion) return unavailable()
    const cls = await prisma.sundaySchoolClass.findUnique({
      where: { id: payload.classId },
      select: { id: true, name: true, updatedAt: true, academicYearId: true, isActive: true, academicYear: { select: { startDate: true, endDate: true } } },
    })
    if (!cls?.isActive) return unavailable()
    const access = await getSundaySchoolAccess(user, cls.academicYearId)
    if (!canViewClass(access, cls.id)) return unavailable()
    const children = await prisma.sundaySchoolChild.findMany({
      where: { classId: cls.id, isActive: true, birthDate: { not: null } },
      select: { id: true, firstName: true, lastName: true, birthDate: true, updatedAt: true },
      orderBy: { id: 'asc' },
    })
    const end = new Date(Math.min(payload.expiresAt, cls.academicYear.endDate.getTime() + 31 * 86400000))
    const calendar = buildBirthdayCalendar(cls, children, cls.academicYear.startDate, end,
      process.env.NEXTAUTH_URL || new URL(request.url).origin)
    return new NextResponse(calendar, { headers: { ...headers,
      'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="class-birthdays.ics"' } })
  } catch (error: unknown) {
    const response = handleApiError(error)
    for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
    return response
  }
}
