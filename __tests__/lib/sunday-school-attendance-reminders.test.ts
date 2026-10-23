import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ assignments: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolServantAssignment: { findMany: mocks.assignments } } }))
vi.mock('@/lib/notifications', () => ({ notifySundaySchoolAttendanceReminder: mocks.notify }))
import { attendanceReminderWeek, getPendingSundaySchoolAttendance, sendSundaySchoolAttendanceReminders } from '@/lib/sunday-school-attendance-reminders'

function assignment(userId = 'servant', level = 'GRADE_6', dates: Array<{ date: Date; attendance: { childId: string }[] }> = []) {
  return { userId, academicYearId: 'year', class: {
    id: 'class', name: 'Class', level, academicYearId: 'year',
    children: [{ id: 'one' }, { id: 'two' }], sessions: dates,
  } }
}
const sunday = new Date('2026-10-18')
const now = new Date('2026-10-20T16:00:00Z')

describe('weekly attendance reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.assignments.mockResolvedValue([assignment()])
    mocks.notify.mockResolvedValue(true)
  })
  it('uses the church calendar across midnight and year boundaries', () => {
    expect(attendanceReminderWeek(new Date('2027-01-03T04:59:00Z')).sunday).toEqual(new Date('2026-12-27'))
    expect(attendanceReminderWeek(new Date('2027-01-03T05:00:00Z')).sunday).toEqual(new Date('2027-01-03'))
  })
  it('reminds without a session and deep-links to the exact date', async () => {
    expect(await getPendingSundaySchoolAttendance(now, 'servant')).toEqual([{
      userId: 'servant', classId: 'class', className: 'Class', sessionDate: '2026-10-18',
      url: '/dashboard/servants/attendance?classId=class&date=2026-10-18',
    }])
    expect(mocks.assignments.mock.calls[0][0].where).toMatchObject({
      userId: 'servant', endedAt: null, classId: { not: null }, academicYear: { isActive: true },
      user: { isDisabled: false }, class: { isActive: true },
    })
  })
  it('keeps partial attendance pending and clears completion for every class servant', async () => {
    mocks.assignments.mockResolvedValue([assignment('first', 'GRADE_6', [{ date: sunday, attendance: [{ childId: 'one' }] }])])
    expect(await getPendingSundaySchoolAttendance(now)).toHaveLength(1)
    const complete = [{ date: sunday, attendance: [{ childId: 'one' }, { childId: 'two' }] }]
    mocks.assignments.mockResolvedValue([assignment('first', 'GRADE_6', complete), assignment('second', 'GRADE_6', complete)])
    expect(await getPendingSundaySchoolAttendance(now)).toEqual([])
  })
  it('does not treat marks from another date or former children as complete', async () => {
    mocks.assignments.mockResolvedValue([assignment('first', 'GRADE_6', [{ date: new Date('2026-10-17'), attendance: [{ childId: 'one' }, { childId: 'two' }] }])])
    expect(await getPendingSundaySchoolAttendance(now)).toHaveLength(1)
    mocks.assignments.mockResolvedValue([assignment('first', 'GRADE_6', [{ date: sunday, attendance: [{ childId: 'one' }, { childId: 'former' }] }])])
    expect(await getPendingSundaySchoolAttendance(now)).toHaveLength(1)
  })
  it('starts a new Elementary reminder week on Saturday', async () => {
    mocks.assignments.mockResolvedValue([assignment('servant', 'GRADE_3')])
    expect((await getPendingSundaySchoolAttendance(new Date('2026-10-24T16:00:00Z')))[0].sessionDate).toBe('2026-10-24')
  })
  it('keeps Elementary on the same meeting date through Friday', async () => {
    mocks.assignments.mockResolvedValue([assignment('servant', 'GRADE_3')])
    for (const instant of ['2026-10-18T16:00:00Z', '2026-10-20T16:00:00Z', '2026-10-22T16:00:00Z', '2026-10-23T16:00:00Z']) {
      expect((await getPendingSundaySchoolAttendance(new Date(instant)))[0].sessionDate).toBe('2026-10-17')
    }
  })
  it('clears a missed Elementary week when the next Saturday is completed', async () => {
    const completed = [{ date: new Date('2026-10-24'), attendance: [{ childId: 'one' }, { childId: 'two' }] }]
    mocks.assignments.mockResolvedValue([assignment('servant', 'GRADE_3', completed)])
    expect(await getPendingSundaySchoolAttendance(new Date('2026-10-23T16:00:00Z'))).toHaveLength(1)
    expect(await getPendingSundaySchoolAttendance(new Date('2026-10-24T16:00:00Z'))).toEqual([])
  })
  it('rolls Elementary over at midnight Eastern on Saturday', () => {
    expect(attendanceReminderWeek(new Date('2026-10-24T03:59:00Z')).saturday).toEqual(new Date('2026-10-17'))
    expect(attendanceReminderWeek(new Date('2026-10-24T04:00:00Z')).saturday).toEqual(new Date('2026-10-24'))
  })
  it.each(['2026-10-17T15:00:00Z', '2026-12-19T16:00:00Z'])(
    'sends Saturday initial reminders only to Elementary: %s', async instant => {
      mocks.assignments.mockResolvedValue([assignment('elementary', 'GRADE_3'), assignment('middle', 'GRADE_6')])
      expect(await sendSundaySchoolAttendanceReminders(new Date(instant))).toEqual({ pending: 1, sent: 1 })
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'elementary', sessionDate: instant.slice(0, 10) }))
    }
  )
  it('sends Sunday initial reminders only to Sunday classes', async () => {
    mocks.assignments.mockResolvedValue([assignment('elementary', 'GRADE_3'), assignment('middle', 'GRADE_6')])
    expect(await sendSundaySchoolAttendanceReminders(new Date('2026-10-18T16:00:00Z'))).toEqual({ pending: 1, sent: 1 })
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'middle' }))
  })
  it.each(['2026-10-20T16:00:00Z', '2026-10-22T16:00:00Z'])(
    'sends follow-ups to both meeting days: %s', async instant => {
      mocks.assignments.mockResolvedValue([assignment('elementary', 'GRADE_3'), assignment('middle', 'GRADE_6')])
      expect(await sendSundaySchoolAttendanceReminders(new Date(instant))).toEqual({ pending: 2, sent: 2 })
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'elementary', sessionDate: '2026-10-17' }))
      expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'middle', sessionDate: '2026-10-18' }))
    }
  )
  it('skips empty rosters, mismatched years, and duplicate assignments', async () => {
    const empty = assignment('empty'); empty.class.children = []
    const stale = assignment('old'); stale.academicYearId = 'old-year'
    mocks.assignments.mockResolvedValue([empty, stale, assignment(), assignment()])
    expect(await getPendingSundaySchoolAttendance(now)).toHaveLength(1)
  })
  it.each(['2026-10-18T16:00:00Z', '2026-10-20T16:00:00Z', '2026-10-22T16:00:00Z', '2026-12-20T16:00:00Z', '2026-12-20T16:59:00Z', '2026-11-01T16:00:00Z', '2026-03-08T16:00:00Z'])(
    'sends the single 16:00 UTC run across DST and Hobby delays: %s', async instant => {
      expect(await sendSundaySchoolAttendanceReminders(new Date(instant))).toEqual({ pending: 1, sent: 1 })
    }
  )
  it('sends the summer Saturday run at noon only to Elementary', async () => {
    mocks.assignments.mockResolvedValue([assignment('elementary', 'GRADE_3'), assignment('middle', 'GRADE_6')])
    expect(await sendSundaySchoolAttendanceReminders(new Date('2026-10-17T16:59:00Z'))).toEqual({ pending: 1, sent: 1 })
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'elementary' }))
  })
  it.each(['2026-10-18T17:00:00Z', '2026-12-20T15:00:00Z', '2026-10-19T16:00:00Z', '2026-10-21T16:00:00Z', '2026-12-19T18:00:00Z', '2026-10-18T14:00:00Z'])(
    'skips other hours and days: %s', async instant => {
      expect(await sendSundaySchoolAttendanceReminders(new Date(instant))).toEqual({ pending: 0, sent: 0 })
      expect(mocks.assignments).not.toHaveBeenCalled()
    }
  )
  it('includes the scheduled day in delivery and counts duplicate suppression', async () => {
    mocks.notify.mockResolvedValue(false)
    expect(await sendSundaySchoolAttendanceReminders(now)).toEqual({ pending: 1, sent: 0 })
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ reminderDate: '2026-10-20', sessionDate: '2026-10-18' }))
  })
})
