// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findUniqueUser: vi.fn(),
  findManyClasses: vi.fn(),
  updateUser: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.findUniqueUser, update: mocks.updateUser },
    sundaySchoolClass: { findMany: mocks.findManyClasses },
  },
}))

import { GET, PUT } from '@/app/api/sunday-school/pinned-classes/route'

function putRequest(body: unknown) {
  return new Request('http://localhost/api/sunday-school/pinned-classes', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

describe('GET /api/sunday-school/pinned-classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refuses anyone but SUPER_ADMIN, reading nothing', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.findUniqueUser).not.toHaveBeenCalled()
  })

  it("returns the admin's stored pins, or an empty list for a new admin (highest-risk path)", async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.findUniqueUser.mockResolvedValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ classIds: [] })
  })
})

describe('PUT /api/sunday-school/pinned-classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
  })

  it('refuses anyone but SUPER_ADMIN, writing nothing', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })

    const response = await PUT(putRequest({ classIds: ['class-1'] }))

    expect(response.status).toBe(403)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('rejects a non-array body', async () => {
    const response = await PUT(putRequest({ classIds: 'class-1' }))
    expect(response.status).toBe(400)
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })

  it('stores only ids that are real, current classes — dropping stale or fabricated ones (highest-risk path)', async () => {
    mocks.findManyClasses.mockResolvedValue([{ id: 'class-1' }])
    mocks.updateUser.mockResolvedValue({})

    const response = await PUT(putRequest({ classIds: ['class-1', 'class-1', 'class-made-up'] }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.findManyClasses).toHaveBeenCalledWith({
      where: { id: { in: ['class-1', 'class-made-up'] } },
      select: { id: true },
    })
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { pinnedSundaySchoolClassIds: ['class-1'] },
    })
    expect(body).toEqual({ classIds: ['class-1'] })
  })

  it('clears pins with an empty list, without querying for real classes', async () => {
    mocks.updateUser.mockResolvedValue({})

    const response = await PUT(putRequest({ classIds: [] }))

    expect(response.status).toBe(200)
    expect(mocks.findManyClasses).not.toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: { pinnedSundaySchoolClassIds: [] },
    })
  })
})
