import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), access: vi.fn(), group: vi.fn(), year: vi.fn(),
  classes: vi.fn(), visibleClass: vi.fn(), assignments: vi.fn(), meeting: vi.fn(), meetings: vi.fn(),
  create: vi.fn(), records: vi.fn(), save: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-access', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sunday-school-access')>(),
  getSundaySchoolAccess: mocks.access,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolAgeGroup: { findUnique: mocks.group },
  academicYear: { findFirst: mocks.year },
  sundaySchoolClass: { findFirst: mocks.visibleClass, findMany: mocks.classes },
  sundaySchoolServantAssignment: { findMany: mocks.assignments },
  sundaySchoolServantsMeeting: { findUnique: mocks.meeting, findMany: mocks.meetings, upsert: mocks.create },
  sundaySchoolMeetingAttendance: { findMany: mocks.records, upsert: mocks.save },
  $transaction: mocks.transaction,
} }))
import { GET, POST, PUT } from '@/app/api/sunday-school/servants-meetings/route'

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

describe('on-demand Elementary servants meetings', () => {
  beforeEach(() => {
    vi.resetAllMocks()
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

  it('keeps priests read-only even when they also have coordinator authority', async () => {
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
})
