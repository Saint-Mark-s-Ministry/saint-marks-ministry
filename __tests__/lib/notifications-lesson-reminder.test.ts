import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), subscriptions: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  notification: { createMany: mocks.create }, pushSubscription: { findMany: mocks.subscriptions },
} }))
vi.mock('web-push', () => ({ default: {
  setVapidDetails: vi.fn(), sendNotification: mocks.push, WebPushError: class extends Error {},
} }))

describe('lesson reminder delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    mocks.subscriptions.mockResolvedValue([{ endpoint: 'https://push.test', p256dh: 'key', auth: 'auth' }])
    mocks.push.mockResolvedValue({})
  })
  const input = { lessonId: 'lesson', userId: 'teacher', className: 'Grade 3', lessonTitle: 'Faith', lessonDate: 'Sat, Oct 17, 2026' }
  it('atomically skips duplicates and pushes only newly created reminders', async () => {
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
    expect(await notifySundaySchoolLessonReminder(input)).toBe(false)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ id: 'ss-lesson-reminder:lesson:teacher', userId: 'teacher', url: '/dashboard/servants/lessons' })],
    }))
    expect(mocks.push).toHaveBeenCalledOnce()
  })
  it('preserves the in-app reminder when push fails', async () => {
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    mocks.create.mockResolvedValue({ count: 1 })
    mocks.push.mockRejectedValue(new Error('offline'))
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
  })
})


describe('attendance reminder delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    mocks.subscriptions.mockResolvedValue([{ endpoint: 'https://push.test', p256dh: 'key', auth: 'auth' }])
    mocks.push.mockResolvedValue({})
  })
  const input = { classId: 'class', userId: 'servant', className: 'Class', sessionDate: '2026-10-18', reminderDate: '2026-10-20', url: '/dashboard/servants/attendance?classId=class&date=2026-10-18' }
  it('atomically suppresses retries and allows a distinct Thursday reminder', async () => {
    const { notifySundaySchoolAttendanceReminder } = await import('@/lib/notifications')
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    expect(await notifySundaySchoolAttendanceReminder(input)).toBe(true)
    expect(await notifySundaySchoolAttendanceReminder(input)).toBe(false)
    expect(await notifySundaySchoolAttendanceReminder({ ...input, reminderDate: '2026-10-22' })).toBe(true)
    expect(mocks.push).toHaveBeenCalledTimes(2)
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, data: [{
      id: 'ss-attendance-reminder:class:2026-10-18:2026-10-20:servant', url: input.url,
    }] })
    expect(mocks.create.mock.calls[2][0].data[0].id).toBe('ss-attendance-reminder:class:2026-10-18:2026-10-22:servant')
  })
  it('preserves in-app delivery when push fails', async () => {
    const { notifySundaySchoolAttendanceReminder } = await import('@/lib/notifications')
    mocks.create.mockResolvedValue({ count: 1 })
    mocks.push.mockRejectedValue(new Error('offline'))
    expect(await notifySundaySchoolAttendanceReminder(input)).toBe(true)
  })
})
