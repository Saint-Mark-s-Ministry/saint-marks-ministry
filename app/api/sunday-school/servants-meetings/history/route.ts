import { RoleTag } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { getSundaySchoolTodayDateInputValue, normalizeSessionDate } from '@/lib/sunday-school-class'

const PAGE_SIZE = 50
const summarySelect = {
  id: true, date: true, title: true,
  ageGroup: { select: { name: true } },
  academicYear: { select: { name: true } },
} as const

// Read-only history across years and archived groups, independent of current assignments.
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (context.disabled || (!context.roleTags.has(RoleTag.PRIEST) && !context.roleTags.has(RoleTag.SUPER_ADMIN))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const params = new URL(request.url).searchParams
    const meetingId = params.get('meetingId')
    const cursor = params.get('cursor')
    if ((meetingId !== null && (!meetingId || meetingId.length > 200)) ||
        (cursor !== null && (!cursor || cursor.length > 200))) {
      return NextResponse.json({ error: 'Invalid meeting or cursor' }, { status: 400 })
    }
    const where = {
      date: { lte: normalizeSessionDate(getSundaySchoolTodayDateInputValue()) },
      attendance: { some: {} },
    }
    if (meetingId) {
      const meeting = await prisma.sundaySchoolServantsMeeting.findFirst({
        where: { ...where, id: meetingId },
        select: {
          ...summarySelect,
          attendance: {
            select: { status: true, servant: { select: { id: true, name: true } } },
            orderBy: [{ servant: { name: 'asc' } }, { servantId: 'asc' }],
          },
        },
      })
      if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
      return NextResponse.json({
        ...summarize(meeting),
        attendance: meeting.attendance.map(record => ({ ...record.servant, status: record.status })),
      })
    }
    const meetings = await prisma.sundaySchoolServantsMeeting.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...summarySelect, attendance: { select: { status: true } } },
    })
    const page = meetings.slice(0, PAGE_SIZE)
    return NextResponse.json({
      meetings: page.map(summarize),
      nextCursor: meetings.length > PAGE_SIZE ? page.at(-1)?.id ?? null : null,
    })
  } catch (error: unknown) { return handleApiError(error) }
}

function summarize(meeting: {
  id: string; date: Date; title: string | null
  ageGroup: { name: string }; academicYear: { name: string }
  attendance: Array<{ status: 'PRESENT' | 'ABSENT' }>
}) {
  return {
    id: meeting.id, date: meeting.date, title: meeting.title,
    ageGroupName: meeting.ageGroup.name, academicYearName: meeting.academicYear.name,
    presentCount: meeting.attendance.filter(record => record.status === 'PRESENT').length,
    absentCount: meeting.attendance.filter(record => record.status === 'ABSENT').length,
    recordedCount: meeting.attendance.length,
  }
}
