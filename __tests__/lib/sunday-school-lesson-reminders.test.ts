import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lessons: vi.fn(), assignment: vi.fn(), notify: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolWeeklyLesson: { findMany: mocks.lessons },
  sundaySchoolServantAssignment: { findFirst: mocks.assignment },
} }))
vi.mock('@/lib/notifications', () => ({ notifySundaySchoolLessonReminder: mocks.notify }))
import { sendSundaySchoolLessonReminders } from '@/lib/sunday-school-lesson-reminders'

const lesson = (id: string, date: string) => ({
  id, ownerId: 'teacher', title: 'Faith', sundayDate: new Date(date),
  class: { id: 'class', name: 'Grade 3', academicYearId: 'year' },
})

describe('Tuesday teaching reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lessons.mockResolvedValue([])
    mocks.assignment.mockResolvedValue({ id: 'assignment' })
    mocks.notify.mockResolvedValue(true)
  })
  it('does nothing outside Tuesday', async () => {
    expect(await sendSundaySchoolLessonReminders(new Date('2026-10-14T14:00:00Z'))).toEqual({ lessons: 0, sent: 0 })
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
  it('selects this week across year boundaries and excludes inactive classes and accounts', async () => {
    await sendSundaySchoolLessonReminders(new Date('2026-12-29T14:30:00Z'))
    expect(mocks.lessons.mock.calls[0][0].where).toMatchObject({
      sundayDate: { gt: new Date('2026-12-29'), lt: new Date('2027-01-05') },
      ownerId: { not: null }, owner: { isDisabled: false },
      class: { isActive: true, OR: [
        { sundaySchoolYear: { status: 'OPEN' } },
        { sundaySchoolYearId: null, academicYear: { isActive: true } },
      ] },
    })
  })
  it('reminds Saturday and Sunday teachers using the actual lesson date', async () => {
    mocks.lessons.mockResolvedValue([lesson('sat', '2026-10-17'), lesson('sun', '2026-10-18')])
    expect(await sendSundaySchoolLessonReminders(new Date('2026-10-13T14:00:00Z'))).toEqual({ lessons: 2, sent: 2 })
    expect(mocks.notify.mock.calls[0][0]).toMatchObject({ lessonId: 'sat', lessonDate: 'Sat, Oct 17, 2026' })
    expect(mocks.notify.mock.calls[1][0]).toMatchObject({ lessonId: 'sun', lessonDate: 'Sun, Oct 18, 2026' })
    expect(mocks.assignment.mock.calls[0][0].where).toMatchObject({ userId: 'teacher', classId: 'class', academicYearId: 'year', endedAt: null })
  })
  it('skips former teachers and previously delivered reminders', async () => {
    mocks.lessons.mockResolvedValue([lesson('old', '2026-10-18'), lesson('sent', '2026-10-18')])
    mocks.assignment.mockResolvedValueOnce(null)
    mocks.notify.mockResolvedValue(false)
    expect(await sendSundaySchoolLessonReminders(new Date('2026-10-13T14:00:00Z'))).toEqual({ lessons: 2, sent: 0 })
    expect(mocks.notify).toHaveBeenCalledOnce()
  })
})
