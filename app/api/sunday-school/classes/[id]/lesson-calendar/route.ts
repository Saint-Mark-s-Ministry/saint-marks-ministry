import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { canViewClass, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { createLessonCalendarToken } from '@/lib/sunday-school-lesson-calendar'

// Sunday School ministry: create a personal read-only lesson subscription, never a prep lesson feed.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) throw new Error('Unauthorized')
    if (session.impersonating) throw new Error('Forbidden')
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, role: true, authVersion: true, isDisabled: true, mustChangePassword: true },
    })
    if (!user || user.isDisabled || user.authVersion !== session.user.authVersion) throw new Error('Unauthorized')
    if (user.mustChangePassword) throw new Error('PasswordChangeRequired')
    const { id } = await params
    const cls = await prisma.sundaySchoolClass.findUnique({
      where: { id }, select: { id: true, name: true, isActive: true, academicYearId: true, academicYear: { select: { endDate: true } } },
    })
    if (!cls?.isActive) throw new Error('Not found')
    const access = await getSundaySchoolAccess(user, cls.academicYearId)
    if (!canViewClass(access, cls.id)) throw new Error('Forbidden')
    const expiresAt = cls.academicYear.endDate.getTime() + 31 * 24 * 60 * 60 * 1000
    if (expiresAt <= Date.now()) throw new Error('Not found')
    const token = createLessonCalendarToken({ userId: user.id, classId: cls.id, authVersion: user.authVersion, expiresAt })
    const feedUrl = new URL(`/api/public/lesson-calendar/${token}.ics`, request.url).href
    return NextResponse.json({ feedUrl, className: cls.name }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) { return handleApiError(error) }
}
