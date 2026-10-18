import { beforeEach, describe, expect, it, vi } from 'vitest'

// The web tests for this reminder mock only browser push. This one covers the
// native Expo transport (MobilePushToken -> exp.host), which the shared sender
// uses for every notification, including the Tuesday teaching reminder.
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  tokens: vi.fn(),
  deleteTokens: vi.fn(),
  subscriptions: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  notification: { createMany: mocks.create },
  mobilePushToken: { findMany: mocks.tokens, deleteMany: mocks.deleteTokens },
  pushSubscription: { findMany: mocks.subscriptions },
} }))
vi.mock('web-push', () => ({ default: {
  setVapidDetails: vi.fn(), sendNotification: vi.fn(), WebPushError: class extends Error {},
} }))

const EXPO = 'https://exp.host/--/api/v2/push/send'
const input = {
  lessonId: 'lesson-1', userId: 'teacher', className: 'Grade 3 Boys',
  lessonTitle: 'Faith', lessonDate: 'Sat, Oct 17, 2026',
}
const device = { id: 'tok-1', token: 'ExponentPushToken[abc]' }

interface ExpoMessage { to: string; title: string; body: string; data: Record<string, unknown> }
const sent = () => JSON.parse(mocks.fetch.mock.calls[0][1].body as string) as ExpoMessage[]

describe('Tuesday teaching reminder: native push', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '')
    vi.stubEnv('VAPID_PRIVATE_KEY', '')
    mocks.create.mockResolvedValue({ count: 1 })
    mocks.tokens.mockResolvedValue([device])
    mocks.subscriptions.mockResolvedValue([])
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }] }) })
  })

  it('delivers to every registered device with the class, date, title and lesson id (happy path)', async () => {
    mocks.tokens.mockResolvedValue([device, { id: 'tok-2', token: 'ExponentPushToken[def]' }])
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: [{ status: 'ok' }, { status: 'ok' }] }) })
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')

    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)

    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(mocks.fetch.mock.calls[0][0]).toBe(EXPO)
    const messages = sent()
    expect(messages.map((m) => m.to)).toEqual(['ExponentPushToken[abc]', 'ExponentPushToken[def]'])
    expect(messages[0]).toMatchObject({
      title: 'Sunday School teaching reminder',
      body: expect.stringContaining('Grade 3 Boys on Sat, Oct 17, 2026: "Faith"'),
      data: {
        url: '/dashboard/servants/lessons',
        tag: 'ss-lesson-reminder:lesson-1:teacher',
        notificationId: 'ss-lesson-reminder:lesson-1:teacher',
        kind: 'sunday-school-lesson-reminder',
        lessonId: 'lesson-1',
      },
    })
  })

  it('reads the actual lesson date for a Sunday class too, and omits a missing title', async () => {
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    await notifySundaySchoolLessonReminder({ ...input, className: 'Grade 7', lessonTitle: null, lessonDate: 'Sun, Oct 18, 2026' })
    const [message] = sent()
    expect(message.body).toContain('Grade 7 on Sun, Oct 18, 2026.')
    expect(message.body).not.toContain('"')
  })

  it('creates the in-app reminder once with a stable id, and does not push a duplicate (highest-risk path)', async () => {
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')

    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
    expect(await notifySundaySchoolLessonReminder(input)).toBe(false)

    expect(mocks.create).toHaveBeenCalledTimes(2)
    for (const [args] of mocks.create.mock.calls) {
      expect(args.skipDuplicates).toBe(true)
      expect(args.data[0].id).toBe('ss-lesson-reminder:lesson-1:teacher')
    }
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('keeps the in-app reminder when the push service is unreachable, and a retry does not resend', async () => {
    mocks.fetch.mockRejectedValue(new Error('network down'))
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')

    expect(await notifySundaySchoolLessonReminder(input)).toBe(true) // created; push failure swallowed
    expect(await notifySundaySchoolLessonReminder(input)).toBe(false) // retry: already there, nothing sent
    expect(mocks.fetch).toHaveBeenCalledOnce()
  })

  it('keeps the in-app reminder when the push service answers with an error', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
  })

  it('still creates the reminder when the token lookup itself fails', async () => {
    mocks.tokens.mockRejectedValue(new Error('db hiccup'))
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('sends nothing to a user with no native device (push denied or not registered)', async () => {
    mocks.tokens.mockResolvedValue([])
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('drops a device the push service reports as gone', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    })
    const { notifySundaySchoolLessonReminder } = await import('@/lib/notifications')
    expect(await notifySundaySchoolLessonReminder(input)).toBe(true)
    expect(mocks.deleteTokens).toHaveBeenCalledWith({ where: { id: { in: ['tok-1'] } } })
  })
})
