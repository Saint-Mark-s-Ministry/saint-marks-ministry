import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(), getAccess: vi.fn(), visibleClassFilter: vi.fn(), findMany: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getAccess,
  visibleClassFilter: mocks.visibleClassFilter,
  canServeClass: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolChild: { findMany: mocks.findMany } } }))

import { GET } from '@/app/api/sunday-school/children/route'
import { withServantsPrepStudentStatus } from '@/lib/sunday-school-child-account'

const account = {
  id: 'prep-1', name: 'Mina Mark', email: 'mina@example.test', profileImageUrl: null,
  isDisabled: false, enrollments: [{ id: 'enrollment-1' }],
}

describe('Sunday School roster Prep label', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAccess.mockResolvedValue({ canRead: true })
    mocks.visibleClassFilter.mockReturnValue(['class-1'])
    mocks.findMany.mockResolvedValue([{ id: 'child-1', user: account }])
  })

  it('exposes enrollment status only after applying Sunday School class scope', async () => {
    const response = await GET(new Request('https://example.test/api/sunday-school/children'))
    expect(response.status).toBe(200)
    const [child] = await response.json()
    expect(child.isServantsPrepStudent).toBe(true)
    expect(child.user).not.toHaveProperty('enrollments')
    expect(child.user).not.toHaveProperty('isDisabled')
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId: { in: ['class-1'] } },
      include: expect.objectContaining({ user: { select: expect.objectContaining({
        enrollments: { where: { isActive: true, status: 'ACTIVE' }, select: { id: true }, take: 1 },
      }) } }),
    }))
  })

  it('denies a Prep user without Sunday School access before reading the roster', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'prep-admin', role: 'SERVANT_PREP' })
    mocks.getAccess.mockResolvedValue({ canRead: false })
    expect((await GET(new Request('https://example.test/api/sunday-school/children'))).status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it('denies requests for classes outside the viewer scope', async () => {
    expect((await GET(new Request('https://example.test/api/sunday-school/children?classId=other'))).status).toBe(403)
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  it('does not label unlinked, disabled, or unenrolled accounts', () => {
    for (const user of [null, { ...account, isDisabled: true }, { ...account, enrollments: [] }]) {
      expect(withServantsPrepStudentStatus({ user }).isServantsPrepStudent).toBe(false)
    }
  })
})
