import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationType, RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  findPriests: vi.fn(),
  createNotification: vi.fn(),
  transaction: vi.fn(),
  findSubscriptions: vi.fn(),
}))

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
    WebPushError: class WebPushError extends Error {
      statusCode = 500
    },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: mocks.findPriests },
    notification: { create: mocks.createNotification },
    pushSubscription: { findMany: mocks.findSubscriptions },
    $transaction: mocks.transaction,
  },
}))

import { notifyPriestNoteCreated } from '@/lib/notifications'

describe('priest-note notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findPriests.mockResolvedValue([{ id: 'priest-2' }, { id: 'priest-3' }])
    mocks.createNotification.mockImplementation(async ({ data }) => ({
      id: `notification-${data.userId}`,
      ...data,
    }))
    mocks.transaction.mockImplementation(async operations => Promise.all(operations))
    mocks.findSubscriptions.mockResolvedValue([])
  })

  it('alerts every other active Priest-tagged user without exposing confidential content', async () => {
    await notifyPriestNoteCreated({
      noteId: 'note-1',
      visitationId: 'visitation-1',
      childId: 'child-1',
      submittedById: 'priest-1',
    })

    expect(mocks.findPriests).toHaveBeenCalledWith({
      where: {
        id: { not: 'priest-1' },
        isDisabled: false,
        roleAssignments: {
          some: { tag: RoleTag.PRIEST, revokedAt: null },
          none: { tag: RoleTag.SUPER_ADMIN, revokedAt: null },
        },
      },
      select: { id: true },
    })
    expect(mocks.createNotification).toHaveBeenCalledTimes(2)

    for (const [input] of mocks.createNotification.mock.calls) {
      expect(input.data).toMatchObject({
        type: NotificationType.PRIEST_NOTE_CREATED,
        title: 'New confidential visitation note',
        body: 'A confidential Sunday School visitation note is ready for review.',
        url: '/dashboard/servants/visitations',
        metadata: {
          noteId: 'note-1',
          visitationId: 'visitation-1',
          childId: 'child-1',
        },
      })
      expect(JSON.stringify(input.data)).not.toContain('pastoral context')
    }
  })
})
