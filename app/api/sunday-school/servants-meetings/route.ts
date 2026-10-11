import { NextResponse } from 'next/server'
import { SundaySchoolServantAttendanceStatus } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getAuthorizationContext } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { canCoordinateAgeGroup, getSundaySchoolAccess } from '@/lib/sunday-school-access'
import { getSundaySchoolTodayDateInputValue, normalizeSessionDate, toDateInputValue } from '@/lib/sunday-school-class'

const personSelect = { id: true, name: true } as const

// Band meetings use band authority; coordinating one class does not expose the band roster.
async function meetingAccess(ageGroupId: string, academicYearId: string, write = false) {
  const user = await requireAuth()
  const [context, access, group] = await Promise.all([
    getAuthorizationContext(user.id),
    getSundaySchoolAccess(user, academicYearId),
    prisma.sundaySchoolAgeGroup.findUnique({ where: { id: ageGroupId } }),
  ])
  if (!group) throw new Error('Not found')
  const canEdit = !context.disabled && !context.readOnly && !access.readOnly &&
    group.isActive && canCoordinateAgeGroup(access, ageGroupId)
  const visibleElementaryClass = access.visibleClassIds === 'all' ? true :
    await prisma.sundaySchoolClass.findFirst({
      where: { id: { in: Array.from(access.visibleClassIds) }, academicYearId,
        isActive: true, level: { in: group.levels } },
      select: { id: true },
    })
  const canView = !context.disabled && access.canRead &&
    (canEdit || Boolean(visibleElementaryClass))
  if (!canView || (write && !canEdit)) throw new Error('Forbidden')
  return { user, group, canEdit }
}

async function rosterAssignments(ageGroupId: string, academicYearId: string) {
  const group = await prisma.sundaySchoolAgeGroup.findUnique({
    where: { id: ageGroupId }, select: { levels: true },
  })
  // Resolve class IDs explicitly: legacy assignments can have a null year in their composite relation.
  const classes = await prisma.sundaySchoolClass.findMany({
    where: { academicYearId, isActive: true, level: { in: group?.levels ?? [] } },
    select: { id: true },
  })
  return prisma.sundaySchoolServantAssignment.findMany({
    where: {
      academicYearId, endedAt: null, user: { isDisabled: false },
      OR: [
        { ageGroupId },
        { classId: { in: classes.map(cls => cls.id) } },
      ],
    },
    select: { userId: true, user: { select: personSelect } },
    orderBy: { user: { name: 'asc' } },
  })
}

// GET lists only explicitly created sessions. Browsing never creates a meeting.
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams
    const ageGroupId = params.get('ageGroupId')
    const meetingId = params.get('meetingId')
    if (!ageGroupId) return NextResponse.json({ error: 'ageGroupId is required' }, { status: 400 })
    const requestedMeeting = meetingId ? await prisma.sundaySchoolServantsMeeting.findUnique({
      where: { id: meetingId },
    }) : null
    if (meetingId && (!requestedMeeting || requestedMeeting.ageGroupId !== ageGroupId)) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    }
    const year = requestedMeeting
      ? { id: requestedMeeting.academicYearId }
      : await prisma.academicYear.findFirst({ where: { isActive: true }, select: { id: true } })
    if (!year) return NextResponse.json({ error: 'No active academic year' }, { status: 400 })
    const { canEdit } = await meetingAccess(ageGroupId, year.id)
    const meetings = await prisma.sundaySchoolServantsMeeting.findMany({
      where: { ageGroupId, academicYearId: year.id }, orderBy: { date: 'desc' },
      select: { id: true, date: true, title: true, _count: { select: { attendance: true } } },
    })
    if (!requestedMeeting) return NextResponse.json({ meetings, meeting: null, roster: [], canEdit, canCreate: canEdit })
    const [assignments, records] = await Promise.all([
      rosterAssignments(ageGroupId, year.id),
      prisma.sundaySchoolMeetingAttendance.findMany({
        where: { meetingId: requestedMeeting.id },
        select: { servantId: true, status: true, servant: { select: personSelect } },
      }),
    ])
    const people = new Map(assignments.map(a => [a.userId, a.user]))
    // Saved attendees stay visible after their assignments end.
    for (const record of records) people.set(record.servantId, record.servant)
    const marks = new Map(records.map(record => [record.servantId, record.status]))
    return NextResponse.json({
      meetings, meeting: requestedMeeting, canCreate: canEdit,
      canEdit: canEdit && toDateInputValue(requestedMeeting.date) <= getSundaySchoolTodayDateInputValue(),
      roster: Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name)).map(person => ({
        ...person, status: marks.get(person.id) ?? null,
      })),
    })
  } catch (error: unknown) { return handleApiError(error) }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.ageGroupId !== 'string' || typeof body.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
      (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 200))) {
      return NextResponse.json({ error: 'A group, valid date, and optional title (up to 200 characters) are required' }, { status: 400 })
    }
    let date: Date
    try { date = normalizeSessionDate(body.date) } catch {
      return NextResponse.json({ error: 'Invalid meeting date' }, { status: 400 })
    }
    if (toDateInputValue(date) !== body.date) return NextResponse.json({ error: 'Invalid meeting date' }, { status: 400 })
    const year = await prisma.academicYear.findFirst({ where: { isActive: true } })
    if (!year) return NextResponse.json({ error: 'No active academic year' }, { status: 400 })
    const { canEdit } = await meetingAccess(body.ageGroupId, year.id, true)
    if (!canEdit) throw new Error('Forbidden')
    if (date < normalizeSessionDate(year.startDate) || date > normalizeSessionDate(year.endDate)) {
      return NextResponse.json({ error: 'Meeting date must be within the active year' }, { status: 400 })
    }
    const meeting = await prisma.sundaySchoolServantsMeeting.upsert({
      where: { ageGroupId_academicYearId_date: { ageGroupId: body.ageGroupId, academicYearId: year.id, date } },
      create: { ageGroupId: body.ageGroupId, academicYearId: year.id, date, title: body.title?.trim() || null },
      update: {},
    })
    return NextResponse.json(meeting, { status: 201 })
  } catch (error: unknown) { return handleApiError(error) }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body.meetingId !== 'string' || !Array.isArray(body.records) ||
      body.records.length === 0 || body.records.length > 1000 ||
      body.records.some((r: unknown) => !r || typeof r !== 'object' ||
        !('servantId' in r) || typeof r.servantId !== 'string' || !r.servantId ||
        !('status' in r) || (r.status !== 'PRESENT' && r.status !== 'ABSENT'))) {
      return NextResponse.json({ error: 'A meeting and present/absent attendance records are required' }, { status: 400 })
    }
    const records = body.records as { servantId: string; status: SundaySchoolServantAttendanceStatus }[]
    const ids = records.map(record => record.servantId)
    if (new Set(ids).size !== ids.length) return NextResponse.json({ error: 'Each servant may only appear once' }, { status: 400 })
    const meeting = await prisma.sundaySchoolServantsMeeting.findUnique({ where: { id: body.meetingId } })
    if (!meeting) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })
    const { user } = await meetingAccess(meeting.ageGroupId, meeting.academicYearId, true)
    if (toDateInputValue(meeting.date) > getSundaySchoolTodayDateInputValue()) {
      return NextResponse.json({ error: 'Attendance cannot be recorded before the meeting date' }, { status: 400 })
    }
    const [assignments, existing] = await Promise.all([
      rosterAssignments(meeting.ageGroupId, meeting.academicYearId),
      prisma.sundaySchoolMeetingAttendance.findMany({ where: { meetingId: meeting.id }, select: { servantId: true } }),
    ])
    const allowed = new Set([...assignments.map(a => a.userId), ...existing.map(a => a.servantId)])
    if (ids.some(id => !allowed.has(id))) return NextResponse.json({ error: 'One or more servants are outside this meeting roster' }, { status: 400 })
    await prisma.$transaction(records.map(record => prisma.sundaySchoolMeetingAttendance.upsert({
      where: { meetingId_servantId: { meetingId: meeting.id, servantId: record.servantId } },
      create: { meetingId: meeting.id, ...record, recordedBy: user.id },
      update: { status: record.status, recordedBy: user.id },
    })))
    return NextResponse.json({ success: true })
  } catch (error: unknown) { return handleApiError(error) }
}
