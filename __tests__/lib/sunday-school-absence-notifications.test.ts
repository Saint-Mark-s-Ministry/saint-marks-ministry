import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceStatus } from '@prisma/client'
const mocks = vi.hoisted(() => ({ classes: vi.fn(), sessions: vi.fn(), assignments: vi.fn(), groups: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolClass: { findMany: mocks.classes },
  sundaySchoolSession: { findMany: mocks.sessions },
  sundaySchoolServantAssignment: { findMany: mocks.assignments },
  sundaySchoolAgeGroup: { findMany: mocks.groups },
} }))
vi.mock('@/lib/notifications', () => ({ notifySundaySchoolAbsence: mocks.notify }))
import { getSundaySchoolAbsenceStreak, sendSundaySchoolAbsenceNotifications } from '@/lib/sunday-school-absence-notifications'

const now = new Date('2026-10-19T15:00:00Z')
const since = new Date('2026-08-01')
const dates = ['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18']
const records = (count: number) => dates.slice(dates.length - count).map(date => ({ date: new Date(date), status: 'ABSENT' as AttendanceStatus }))

describe('weekly absence streaks', () => {
  it.each([0, 1, 2, 3, 4, 5])('counts %i recorded consecutive absences', count => {
    expect(getSundaySchoolAbsenceStreak('GRADE_9', records(count), now, since).weeks).toBe(count)
  })
  it.each(['PRESENT', 'LATE', 'EXCUSED'] as const)('resets on %s', status => {
    const history = records(5)
    history[3].status = status
    expect(getSundaySchoolAbsenceStreak('GRADE_9', history, now, since).weeks).toBe(1)
  })
  it('breaks on an unrecorded meeting and ignores stale history', () => {
    expect(getSundaySchoolAbsenceStreak('GRADE_9', records(5).filter((_, i) => i !== 3), now, since).weeks).toBe(1)
    expect(getSundaySchoolAbsenceStreak('GRADE_9', records(5).slice(0, -1), now, since).weeks).toBe(0)
  })
  it('starts a new episode after attendance resumes and excludes pre-placement history', () => {
    const history = records(5)
    history[1].status = 'PRESENT'
    expect(getSundaySchoolAbsenceStreak('GRADE_9', history, now, since)).toEqual({ weeks: 3, firstAbsenceDate: '2026-10-04' })
    expect(getSundaySchoolAbsenceStreak('GRADE_9', records(5), now, new Date('2026-10-10')).weeks).toBe(2)
  })
  it('supports Saturday classes and excludes the meeting still in progress', () => {
    const history = ['2026-10-03', '2026-10-10', '2026-10-17'].map(date => ({ date: new Date(date), status: 'ABSENT' as const }))
    expect(getSundaySchoolAbsenceStreak('GRADE_3', history, now, since).weeks).toBe(3)
    expect(getSundaySchoolAbsenceStreak('GRADE_3', history, new Date('2026-10-17T15:00Z'), since).weeks).toBe(2)
  })
})

describe('absence recipients and thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.classes.mockResolvedValue([{
      id: 'class', name: 'Grade 9', level: 'GRADE_9', academicYearId: 'academic', sundaySchoolYearId: 'year',
      createdAt: since, sundaySchoolYear: { startDate: since },
      children: [{ id: 'child', firstName: 'Test', lastName: 'Child', createdAt: since }],
      placements: [{ startedAt: since, enrollment: { childId: 'child' } }],
    }])
    mocks.assignments.mockResolvedValue([{ userId: 'servant' }, { userId: 'servant' }])
    mocks.groups.mockResolvedValue([{
      assignments: [{ userId: 'coordinator' }, { userId: 'coordinator' }],
      overseer: { id: 'priest', role: 'PRIEST', isDisabled: false },
    }])
    mocks.notify.mockResolvedValue(true)
  })
  const setWeeks = (count: number) => mocks.sessions.mockResolvedValue(records(count).map(record => ({
    date: record.date, attendance: [{ childId: 'child', status: record.status }],
  })))
  it.each([2, 3, 4, 5])('routes %i weeks to the appropriate assigned people', async weeks => {
    setWeeks(weeks)
    const result = await sendSundaySchoolAbsenceNotifications(now)
    const recipients = mocks.notify.mock.calls.map(([input]) => [input.userId, input.threshold])
    expect(recipients).toEqual(weeks < 3 ? [] : weeks < 4
      ? [['servant', 2]] : [['servant', 2], ['coordinator', 4], ['priest', 4]])
    expect(result.sent).toBe(recipients.length)
  })
  it('scopes active assignments, bands, and open years to this class year', async () => {
    setWeeks(5)
    await sendSundaySchoolAbsenceNotifications(now)
    expect(mocks.assignments.mock.calls[0][0].where).toMatchObject({ classId: 'class', sundaySchoolYearId: 'year', endedAt: null, user: { isDisabled: false } })
    expect(mocks.groups.mock.calls[0][0].where).toMatchObject({ sundaySchoolYearId: 'year', levelRows: { some: { level: 'GRADE_9' } }, isActive: true })
    expect(mocks.groups.mock.calls[0][0].select.assignments.where).toMatchObject({ sundaySchoolYearId: 'year', authority: 'COORDINATOR', endedAt: null, user: { isDisabled: false } })
    expect(mocks.classes.mock.calls[0][0].where.OR[0]).toMatchObject({ sundaySchoolYear: { status: 'OPEN' } })
  })
  it('never broadcasts escalation to other priests when no active overseer is assigned', async () => {
    setWeeks(5)
    mocks.groups.mockResolvedValue([{ assignments: [], overseer: { id: 'disabled', role: 'PRIEST', isDisabled: true } }])
    await sendSundaySchoolAbsenceNotifications(now)
    expect(mocks.notify.mock.calls.map(([input]) => input.userId)).toEqual(['servant'])
  })
  it('skips durable-year children without an active placement', async () => {
    setWeeks(5)
    const [cls] = await mocks.classes()
    cls.placements = []
    await sendSundaySchoolAbsenceNotifications(now)
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('supports legacy academic-year staffing and level ownership', async () => {
    setWeeks(3)
    const [cls] = await mocks.classes()
    cls.sundaySchoolYearId = null
    cls.sundaySchoolYear = null
    cls.placements = []
    await sendSundaySchoolAbsenceNotifications(now)
    expect(mocks.notify).toHaveBeenCalledOnce()
    expect(mocks.assignments.mock.calls[0][0].where).toMatchObject({ sundaySchoolYearId: null, academicYearId: 'academic' })
    expect(mocks.groups.mock.calls[0][0].where).toMatchObject({ sundaySchoolYearId: null, levels: { has: 'GRADE_9' } })
  })
  it('does not count duplicate deliveries as sent', async () => {
    setWeeks(5)
    mocks.notify.mockResolvedValue(false)
    expect((await sendSundaySchoolAbsenceNotifications(now)).sent).toBe(0)
  })
})
