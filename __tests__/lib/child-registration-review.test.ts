import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findManyChildren: vi.fn(),
  findManyRequests: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolChild: { findMany: mocks.findManyChildren },
    childRegistrationRequest: { findMany: mocks.findManyRequests },
  },
}))

import { findRegistrationDuplicates, maskGuardianPhone } from '@/lib/child-registration-review'

describe('maskGuardianPhone', () => {
  it('keeps only the last 4 digits', () => {
    expect(maskGuardianPhone('2015550170')).toBe('•••• 0170')
  })

  it('still works with a leading +', () => {
    expect(maskGuardianPhone('+12015550170')).toBe('•••• 0170')
  })
})

describe('findRegistrationDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports no matches when nothing else shares the name and birth date', async () => {
    mocks.findManyChildren.mockResolvedValue([])
    mocks.findManyRequests.mockResolvedValue([])

    const signal = await findRegistrationDuplicates({
      id: 'req-1',
      firstName: 'Anna',
      lastName: 'Youssef',
      birthDate: new Date('2018-01-01'),
      intendedLevel: 'ELEMENTARY' as never,
    })

    expect(signal).toEqual({ matchCount: 0, matches: [] })
  })

  it('surfaces an existing active child and another pending request, with no guardian contact', async () => {
    mocks.findManyChildren.mockResolvedValue([
      { id: 'child-1', firstName: 'Anna', lastName: 'Youssef', class: { name: 'Elementary A' } },
    ])
    mocks.findManyRequests.mockResolvedValue([
      { id: 'req-2', firstName: 'Anna', lastName: 'Youssef' },
    ])

    const signal = await findRegistrationDuplicates({
      id: 'req-1',
      firstName: 'anna ',
      lastName: ' Youssef',
      birthDate: new Date('2018-01-01'),
      intendedLevel: 'ELEMENTARY' as never,
    })

    expect(signal.matchCount).toBe(2)
    expect(signal.matches).toEqual([
      { type: 'existing_child', id: 'child-1', firstName: 'Anna', lastName: 'Youssef', className: 'Elementary A' },
      { type: 'pending_request', id: 'req-2', firstName: 'Anna', lastName: 'Youssef', className: null },
    ])
    // Excludes itself and scopes to the same intended level, matching the
    // queue's own existing level-based visibility boundary.
    expect(mocks.findManyRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'req-1' }, intendedLevel: 'ELEMENTARY' }),
      })
    )
  })
})
