import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findMany: mocks.findMany } },
}))

import { GET } from '@/app/api/mentor-options/route'

describe('GET /api/mentor-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: UserRole.SERVANT_PREP })
    mocks.findMany.mockResolvedValue([])
  })

  it('includes active priests in the mentor candidate query', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        role: {
          in: expect.arrayContaining([
            UserRole.PRIEST,
            UserRole.MENTOR,
            UserRole.SERVANT_PREP,
          ]),
        },
        isDisabled: false,
      },
    }))
  })

  it('does not expose mentor candidates to read-only priests', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: UserRole.PRIEST })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})
