import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'

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

  it('queries active staff tags, including Sunday School servants, with a legacy fallback', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isDisabled: false,
        OR: [
          { roleAssignments: { some: {
            tag: { in: [RoleTag.SUPER_ADMIN, RoleTag.PRIEST, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.SUNDAY_SCHOOL_SERVANT] },
            revokedAt: null,
          } } },
          { roleAssignments: { none: {} }, role: { in: [UserRole.SUPER_ADMIN, UserRole.PRIEST, UserRole.SERVANT_PREP, UserRole.MENTOR] } },
        ],
      },
    }))
  })

  it('allows priests to select mentor candidates', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: UserRole.PRIEST })

    const response = await GET()

    expect(response.status).toBe(200)
    expect(mocks.findMany).toHaveBeenCalled()
  })
})
