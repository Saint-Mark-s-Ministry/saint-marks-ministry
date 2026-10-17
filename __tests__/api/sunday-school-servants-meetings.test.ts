import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), access: vi.fn(), group: vi.fn(), year: vi.fn(),
  classes: vi.fn(), visibleClass: vi.fn(), assignments: vi.fn(), meeting: vi.fn(), meetings: vi.fn(),
  create: vi.fn(), records: vi.fn(), save: vi.fn(), transaction: vi.fn(), venue: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-access', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sunday-school-access')>(),
  getSundaySchoolAccess: mocks.access,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolAgeGroup: { findUnique: mocks.group },
  academicYear: { findFirst: mocks.year, findUnique: mocks.year },
  sundaySchoolClass: { findFirst: mocks.visibleClass, findMany: mocks.classes },
  sundaySchoolServantAssignment: { findMany: mocks.assignments },
  sundaySchoolServantsMeeting: { findUnique: mocks.meeting, findMany: mocks.meetings, upsert: mocks.create },
  sundaySchoolMeetingAttendance: { findMany: mocks.records, upsert: mocks.save },
  $transaction: mocks.transaction,
} }))
vi.mock('@/lib/meeting-geofence', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/meeting-geofence')>(), meetingVenue: mocks.venue,
}))
import { GET, POST, PUT, PATCH } from '@/app/api/sunday-school/servants-meetings/route'

const coordinator = {
  isAdmin: false, readOnly: false, canRead: true,
  coordinatorAgeGroupIds: new Set(['elementary']), visibleClassIds: new Set(['class-1']),
}
const meeting = { id: 'meeting-1', ageGroupId: 'elementary', academicYearId: 'year-1', date: new Date('2026-01-15'), title: 'Planning' }
const servant = { id: 'servant-1', name: 'Mary' }
const request = (method: string, body: unknown) => new Request('http://localhost/api/sunday-school/servants-meetings', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const put = (records = [{ servantId: servant.id, status: 'PRESENT' }]) => PUT(request('PUT', { meetingId: meeting.id, records }))

describe('servants meetings', () => {
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useRealTimers()
    mocks.venue.mockResolvedValue({ latitude: 40.72, longitude: -74.09 })
    mocks.auth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false })
    mocks.access.mockResolvedValue(coordinator)
    mocks.group.mockResolvedValue({ id: 'elementary', name: 'Elementary', levels: ['GRADE_1'], isActive: true })
    mocks.year.mockResolvedValue({ id: 'year-1', startDate: new Date('2025-09-01'), endDate: new Date('2026-08-31') })
    mocks.visibleClass.mockResolvedValue({ id: 'class-1' })
    mocks.classes.mockResolvedValue([{ id: 'class-1' }])
    mocks.meeting.mockResolvedValue(meeting)
    mocks.meetings.mockResolvedValue([meeting])
    mocks.create.mockResolvedValue(meeting)
    mocks.assignments.mockResolvedValue([{ userId: servant.id, user: servant }, { userId: servant.id, user: servant }])
    mocks.records.mockResolvedValue([])
    mocks.save.mockResolvedValue({})
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations))
  })

  it('browses a list without creating any session', async () => {
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary'))
    expect(res.status).toBe(200)
    expect((await res.json()).meeting).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.assignments).not.toHaveBeenCalled()
  })

  it('lets ordinary Elementary servants read a deduplicated roster and saved history', async () => {
    mocks.access.mockResolvedValue({ ...coordinator, coordinatorAgeGroupIds: new Set() })
    mocks.records.mockResolvedValue([{ servantId: 'former', status: 'ABSENT', servant: { id: 'former', name: 'Former servant' } }])
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary&meetingId=meeting-1'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.canEdit).toBe(false)
    expect(data.canCreate).toBe(false)
    expect(data.roster).toHaveLength(2)
    expect(data.roster.find((p: { id: string }) => p.id === 'former').status).toBe('ABSENT')
  })

  it('refuses a servant from another band even if they can enter Sunday School', async () => {
    mocks.access.mockResolvedValue({ ...coordinator, coordinatorAgeGroupIds: new Set(), visibleClassIds: new Set(['middle-class']) })
    mocks.visibleClass.mockResolvedValue(null)
    expect((await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary'))).status).toBe(403)
    expect(mocks.meetings).not.toHaveBeenCalled()
  })

  it('creates one explicit session, deduplicating repeat requests for its date', async () => {
    const res = await POST(request('POST', { ageGroupId: 'elementary', date: '2026-01-15', title: ' Planning ' }))
    expect(res.status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      where: { ageGroupId_academicYearId_date: { ageGroupId: 'elementary', academicYearId: 'year-1', date: new Date('2026-01-15') } },
      create: expect.objectContaining({ title: 'Planning' }), update: {},
    }))
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it.each(['2026-02-30', 'invalid', '2024-01-01'])('rejects invalid or out-of-year date %s', async date => {
    expect((await POST(request('POST', { ageGroupId: 'elementary', date }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('refuses creation and attendance writes by ordinary servants', async () => {
    mocks.access.mockResolvedValue({ ...coordinator, coordinatorAgeGroupIds: new Set() })
    expect((await POST(request('POST', { ageGroupId: 'elementary', date: '2026-01-15' }))).status).toBe(403)
    expect((await put()).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('denies an explicitly read-only context even with coordinator authority', async () => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: true })
    expect((await put()).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('saves past on-demand sessions without a weekly or today-only restriction', async () => {
    expect((await put()).status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      where: { meetingId_servantId: { meetingId: 'meeting-1', servantId: 'servant-1' } },
      update: { status: 'PRESENT', recordedBy: 'coordinator-1' },
    }))
  })

  it.each([
    { records: [{ servantId: 'outside-band', status: 'PRESENT' }] },
    { records: [{ servantId: servant.id, status: 'LATE' }] },
    { records: [{ servantId: servant.id, status: 'PRESENT' }, { servantId: servant.id, status: 'ABSENT' }] },
  ])('rejects out-of-scope, invalid, or duplicate marks', async ({ records }) => {
    expect((await put(records)).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('does not accept attendance for future sessions', async () => {
    mocks.meeting.mockResolvedValue({ ...meeting, date: new Date('2099-01-01') })
    expect((await put()).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('rejects a meeting belonging to a different requested band', async () => {
    mocks.meeting.mockResolvedValue({ ...meeting, ageGroupId: 'middle' })
    expect((await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary&meetingId=meeting-1'))).status).toBe(404)
  })
  it('projects first Saturdays without writing meetings', async () => {
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary'))
    const data = await res.json()
    expect(data.meetings.some((m: { date: string }) => m.date.startsWith('2026-01-03'))).toBe(true)
    expect(data.schedule).toBe('First Saturday of every month')
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('automatically opens today’s scheduled meeting for an ordinary servant without creating records', async () => {
    onMeetingDay()
    vi.setSystemTime(new Date('2026-01-03T18:00:00Z'))
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.meeting.id).toBe('scheduled:elementary:2026-01-03')
    expect(data.canCheckIn).toBe(true)
    expect(data.canEdit).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
  })

  it('keeps an explicitly selected past meeting instead of changing it to today', async () => {
    onMeetingDay()
    vi.setSystemTime(new Date('2026-01-03T18:00:00Z'))
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=elementary&meetingId=meeting-1'))
    expect((await res.json()).meeting.id).toBe(meeting.id)
  })

  it('projects third Sundays for Sunday classes', async () => {
    mocks.group.mockResolvedValue({ id: 'middle', name: 'Middle School', levels: ['GRADE_6'], isActive: true })
    const res = await GET(new Request('http://localhost/api/sunday-school/servants-meetings?ageGroupId=middle'))
    const data = await res.json()
    expect(data.meetings.some((m: { date: string }) => m.date.startsWith('2026-01-18'))).toBe(true)
    expect(data.schedule).toBe('Third Sunday of every month')
  })

  it('checks into a scheduled session without requiring a coordinator to create it first', async () => {
    onMeetingDay()
    vi.setSystemTime(new Date('2026-01-03T18:00:00Z'))
    mocks.meeting.mockResolvedValue(null)
    mocks.create.mockResolvedValue({ ...meeting, date: new Date('2026-01-03') })
    const res = await PATCH(request('PATCH', { meetingId: 'scheduled:elementary:2026-01-03',
      position: { latitude: 40.72, longitude: -74.09, accuracy: 10, timestamp: Date.now() },
    }))
    expect(res.status).toBe(200)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      where: { ageGroupId_academicYearId_date: { ageGroupId: 'elementary', academicYearId: 'year-1', date: new Date('2026-01-03') } },
      update: {},
    }))
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      create: { meetingId: meeting.id, servantId: servant.id, status: 'PRESENT', recordedBy: servant.id },
    }))
  })

  it('rejects invented recurring dates before creating anything', async () => {
    onMeetingDay()
    const res = await PATCH(request('PATCH', { meetingId: 'scheduled:elementary:2026-01-15',
      position: { latitude: 40.72, longitude: -74.09, accuracy: 10, timestamp: Date.now() },
    }))
    expect(res.status).toBe(404)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  function selfCheckIn(position: unknown = { latitude: 40.72, longitude: -74.09, accuracy: 10, timestamp: Date.now() }) {
    return PATCH(request('PATCH', { meetingId: meeting.id, servantId: 'someone-else', position }))
  }
  function onMeetingDay() {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T18:00:00Z'))
    mocks.auth.mockResolvedValue({ id: servant.id, role: 'SERVANT' })
    mocks.access.mockResolvedValue({ ...coordinator, coordinatorAgeGroupIds: new Set() })
  }
  it('checks in only the authenticated servant and reuses the attendance key', async () => {
    onMeetingDay()
    expect((await selfCheckIn()).status).toBe(200)
    expect((await selfCheckIn()).status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
      where: { meetingId_servantId: { meetingId: meeting.id, servantId: servant.id } },
      create: { meetingId: meeting.id, servantId: servant.id, status: 'PRESENT', recordedBy: servant.id },
    }))
  })
  it('rejects check-in outside the venue', async () => {
    onMeetingDay()
    expect((await selfCheckIn({ latitude: 40.73, longitude: -74.09, accuracy: 10, timestamp: Date.now() })).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it.each([null, { latitude: 40.72, longitude: -74.09, accuracy: 1000, timestamp: 0 }])('rejects missing or inaccurate location', async position => {
    onMeetingDay()
    expect((await selfCheckIn(position)).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('rejects past and future self check-ins', async () => {
    onMeetingDay()
    vi.setSystemTime(new Date('2026-01-16T18:00:00Z'))
    expect((await selfCheckIn()).status).toBe(400)
    vi.setSystemTime(new Date('2026-01-14T18:00:00Z'))
    expect((await selfCheckIn()).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('does not allow former or out-of-group servants to self check in', async () => {
    onMeetingDay()
    mocks.assignments.mockResolvedValue([])
    expect((await selfCheckIn()).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('fails closed if the venue cannot be verified', async () => {
    onMeetingDay()
    mocks.venue.mockRejectedValue(new Error('Unavailable'))
    expect((await selfCheckIn()).status).toBe(503)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('denies check-in from read-only and disabled contexts', async () => {
    onMeetingDay()
    mocks.context.mockResolvedValue({ disabled: false, readOnly: true })
    expect((await selfCheckIn()).status).toBe(403)
    mocks.context.mockResolvedValue({ disabled: true, readOnly: false })
    expect((await selfCheckIn()).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })

})
