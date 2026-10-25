import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), subscriptions: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  notification: { createMany: mocks.create }, pushSubscription: { findMany: mocks.subscriptions },
} }))
vi.mock('web-push', () => ({ default: {
  setVapidDetails: vi.fn(), sendNotification: mocks.push, WebPushError: class extends Error {},
} }))

describe('absence notification delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    mocks.subscriptions.mockResolvedValue([{ endpoint: 'https://push.test', p256dh: 'key', auth: 'auth' }])
    mocks.push.mockResolvedValue({})
  })
  const input = { childId: 'child', childName: 'Test Child', classId: 'class', className: 'Grade 3', userId: 'teacher', firstAbsenceDate: '2026-10-03', weeks: 3, threshold: 2 as const }
  it('atomically skips duplicates and pushes only newly created reminders', async () => {
    const { notifySundaySchoolAbsence } = await import('@/lib/notifications')
    mocks.create.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    expect(await notifySundaySchoolAbsence(input)).toBe(true)
    expect(await notifySundaySchoolAbsence(input)).toBe(false)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({ id: 'ss-absence:class:child:2026-10-03:2:teacher', userId: 'teacher', url: '/dashboard/servants/visitations?childId=child' })],
    }))
    expect(mocks.push).toHaveBeenCalledOnce()
    expect(mocks.create.mock.calls[0][0].data[0].body).toContain('Please follow up with this student.')
  })
  it('preserves the in-app reminder when push fails', async () => {
    const { notifySundaySchoolAbsence } = await import('@/lib/notifications')
    mocks.create.mockResolvedValue({ count: 1 })
    mocks.push.mockRejectedValue(new Error('offline'))
    expect(await notifySundaySchoolAbsence(input)).toBe(true)
  })
  it('keeps escalation and later absence episodes distinct', async () => {
    const { notifySundaySchoolAbsence } = await import('@/lib/notifications')
    mocks.create.mockResolvedValue({ count: 1 })
    await notifySundaySchoolAbsence({ ...input, threshold: 4, weeks: 4 })
    await notifySundaySchoolAbsence({ ...input, firstAbsenceDate: '2026-11-07' })
    expect(mocks.create.mock.calls[0][0].data[0].body).toContain('4 consecutive weeks (4 or more weeks)')
    expect(mocks.create.mock.calls.map(([query]) => query.data[0].id)).toEqual([
      'ss-absence:class:child:2026-10-03:4:teacher',
      'ss-absence:class:child:2026-11-07:2:teacher',
    ])
  })

})
