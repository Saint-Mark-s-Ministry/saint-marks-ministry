import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  notify: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { sundaySchoolWeeklyLesson: { findMany: mocks.findMany, updateMany: mocks.updateMany } },
}))
vi.mock('@/lib/notifications', () => ({ notifySundaySchoolLessonReminder: mocks.notify }))

import { GET } from '@/app/api/cron/sunday-school-lesson-reminders/route'

function authed() {
  return new Request('http://localhost/api/cron/sunday-school-lesson-reminders', {
    headers: { authorization: 'Bearer test-secret' },
  })
}

describe('Sunday School lesson reminder cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    mocks.findMany.mockResolvedValue([])
    mocks.updateMany.mockResolvedValue({ count: 0 })
  })

  it('rejects missing or incorrect bearer credentials, querying nothing', async () => {
    expect((await GET(new Request('http://localhost/api/cron/sunday-school-lesson-reminders'))).status).toBe(401)
    expect((await GET(new Request('http://localhost/api/cron/sunday-school-lesson-reminders', {
      headers: { authorization: 'Bearer wrong' },
    }))).status).toBe(401)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it('only looks at assigned, not-yet-reminded lessons within the window (highest-risk path)', async () => {
    await GET(authed())
    const where = mocks.findMany.mock.calls[0][0].where
    expect(where.ownerId).toEqual({ not: null })
    expect(where.reminderSentAt).toBeNull()
    expect(where.sundayDate.gte < where.sundayDate.lte).toBe(true)
  })

  it('notifies each due lesson once and marks it sent, including a title when there is one', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'lesson-1', ownerId: 'owner-1', title: 'Parable of the Sower', sundayDate: new Date('2026-10-18T00:00:00.000Z'), class: { name: '5th Grade' } },
      { id: 'lesson-2', ownerId: 'owner-2', title: null, sundayDate: new Date('2026-10-18T00:00:00.000Z'), class: { name: '6th Grade' } },
    ])

    const response = await GET(authed())
    const body = await response.json()

    expect(body).toEqual({ success: true, checked: 2, sent: 2 })
    expect(mocks.notify).toHaveBeenNthCalledWith(1, {
      ownerId: 'owner-1', className: '5th Grade', sundayDate: '2026-10-18', lessonTitle: 'Parable of the Sower',
    })
    expect(mocks.notify).toHaveBeenNthCalledWith(2, {
      ownerId: 'owner-2', className: '6th Grade', sundayDate: '2026-10-18', lessonTitle: null,
    })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lesson-1', 'lesson-2'] } },
      data: { reminderSentAt: expect.any(Date) },
    })
  })

  it('never calls updateMany when nothing is due, so reminderSentAt rows are untouched', async () => {
    await GET(authed())
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
})
