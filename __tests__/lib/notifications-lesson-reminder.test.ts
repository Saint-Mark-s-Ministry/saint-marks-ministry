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
