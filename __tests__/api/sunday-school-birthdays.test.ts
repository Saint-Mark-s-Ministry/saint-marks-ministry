import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sunday-school-access')>()
  return { ...actual, getSundaySchoolAccess: mocks.getAccess }
})
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolChild: { findMany: mocks.findMany } } }))

import { GET } from '@/app/api/sunday-school/birthdays/route'

describe('GET /api/sunday-school/birthdays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.findMany.mockResolvedValue([])
  })

  it('refuses a caller without Sunday School read access, and reads nothing', async () => {
    mocks.getAccess.mockResolvedValue({ canRead: false, visibleClassIds: new Set() })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it('limits birthdays to the classes the caller can see', async () => {
    mocks.getAccess.mockResolvedValue({ canRead: true, visibleClassIds: new Set(['class-a']) })

    await GET()

    expect(mocks.findMany.mock.calls[0][0].where.classId).toEqual({ in: ['class-a'] })
  })

  it('selects birthday fields only: no guardian, family, phone, or photo', async () => {
    mocks.getAccess.mockResolvedValue({ canRead: true, visibleClassIds: 'all' })

    await GET()

    const select = mocks.findMany.mock.calls[0][0].select
    expect(Object.keys(select).sort()).toEqual(['birthDate', 'class', 'classId', 'firstName', 'id', 'lastName'])
  })
})
