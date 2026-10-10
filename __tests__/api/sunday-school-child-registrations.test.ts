import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  findMany: vi.fn(),
  findManyChildren: vi.fn(),
  findManyRequests: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    childRegistrationRequest: { findMany: mocks.findMany },
    sundaySchoolChild: { findMany: mocks.findManyChildren },
  },
}))

import { GET } from '@/app/api/sunday-school/child-registrations/route'

const baseRequest = {
  id: 'req-1',
  status: 'PENDING',
  firstName: 'Anna',
  lastName: 'Youssef',
  birthDate: new Date('2018-01-01'),
  intendedLevel: 'ELEMENTARY',
  guardianName: 'Mina Youssef',
  guardianPhone: '2015550170',
  guardianEmail: 'mina@example.com',
  notes: null,
  submittedBy: { id: 'parent-1', name: 'Mina Youssef', email: 'mina@example.com', phone: null },
  reviewer: null,
  placedClass: null,
}

describe('GET /api/sunday-school/child-registrations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue({
      canRead: true,
      isAdmin: false,
      coordinatorLevels: new Set(['ELEMENTARY']),
    })
    mocks.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      // The duplicate-signal lookup also goes through childRegistrationRequest.findMany
      // (via findRegistrationDuplicates), distinguishable by its `id: { not }` filter.
      if (where.id) return []
      return [baseRequest]
    })
    mocks.findManyChildren.mockResolvedValue([])
  })

  it('without summary=1, returns guardian contact unmasked (the existing web behavior)', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/child-registrations?status=PENDING'))
    const body = await response.json()

    expect(body).toEqual([{ ...baseRequest, birthDate: baseRequest.birthDate.toISOString() }])
  })

  it('with summary=1, masks the guardian phone, drops the email, and attaches a duplicate signal', async () => {
    const response = await GET(
      new Request('http://localhost/api/sunday-school/child-registrations?status=PENDING&summary=1')
    )
    const body = await response.json()

    expect(body).toHaveLength(1)
    expect(body[0].guardianPhone).toBe('•••• 0170')
    expect(body[0].guardianEmail).toBeUndefined()
    expect(body[0].hasGuardianEmail).toBe(true)
    expect(body[0].duplicateSignal).toEqual({ matchCount: 0, matches: [] })
  })

  it('scopes a non-admin coordinator to their own levels', async () => {
    await GET(new Request('http://localhost/api/sunday-school/child-registrations?status=PENDING'))

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ intendedLevel: { in: ['ELEMENTARY'] } }),
      })
    )
  })
})
