// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { mobilePushToken: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } },
}))

import { POST as SUBSCRIBE } from '@/app/api/push/mobile-subscribe/route'
import { POST as UNSUBSCRIBE } from '@/app/api/push/mobile-unsubscribe/route'

function request(body: unknown) {
  return new Request('http://localhost/api/push/mobile-subscribe', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof SUBSCRIBE>[0]
}

describe('POST /api/push/mobile-subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it('upserts the token for this user and platform (happy path)', async () => {
    mocks.upsert.mockResolvedValue({ id: 'token-row-1' })

    const response = await SUBSCRIBE(request({ token: 'ExponentPushToken[abc]', platform: 'ios' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ id: 'token-row-1', success: true })
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_token: { userId: 'user-1', token: 'ExponentPushToken[abc]' } },
      update: { platform: 'ios' },
      create: { userId: 'user-1', token: 'ExponentPushToken[abc]', platform: 'ios' },
    })
  })

  it('rejects a missing token and an invalid platform, writing nothing (highest-risk path)', async () => {
    const empty = await SUBSCRIBE(request({ token: '', platform: 'ios' }))
    expect(empty.status).toBe(400)

    const badPlatform = await SUBSCRIBE(request({ token: 'x', platform: 'web' }))
    expect(badPlatform.status).toBe(400)

    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})

describe('POST /api/push/mobile-unsubscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'user-1' })
  })

  it("removes only this user's matching token", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 })

    const response = await UNSUBSCRIBE(request({ token: 'ExponentPushToken[abc]' }))

    expect(response.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', token: 'ExponentPushToken[abc]' },
    })
  })

  it('rejects a missing token', async () => {
    const response = await UNSUBSCRIBE(request({}))
    expect(response.status).toBe(400)
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
})
