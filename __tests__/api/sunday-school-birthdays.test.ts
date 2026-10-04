// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  visibleClassFilter: vi.fn(),
  findMany: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.access,
  visibleClassFilter: mocks.visibleClassFilter,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { sundaySchoolChild: { findMany: mocks.findMany } },
}))

import { GET } from '@/app/api/sunday-school/birthdays/route'

describe('Sunday School birthdays', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.access.mockResolvedValue({ canRead: true })
    mocks.visibleClassFilter.mockReturnValue(['class-1'])
    mocks.findMany.mockResolvedValue([])
  })

  it('rejects accounts without Sunday School access', async () => {
    mocks.access.mockResolvedValue({ canRead: false })

    const response = await GET()

    expect(response.status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it('only loads active children with birthdays from the viewer’s classes', async () => {
    await GET()

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isActive: true,
        birthDate: { not: null },
        classId: { in: ['class-1'] },
      },
    }))
  })

  it('selects birthday display fields without contact or family details', async () => {
    await GET()

    const query = mocks.findMany.mock.calls[0][0]
    expect(query.select).toEqual(expect.objectContaining({
      id: true,
      firstName: true,
      lastName: true,
      birthDate: true,
      class: expect.any(Object),
    }))
    expect(query.select).not.toHaveProperty('guardianPhone')
    expect(query.select).not.toHaveProperty('cellPhone')
    expect(query.select).not.toHaveProperty('family')
  })
})
