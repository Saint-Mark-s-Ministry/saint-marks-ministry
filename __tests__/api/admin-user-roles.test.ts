import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  findActorGrant: vi.fn(),
  findUser: vi.fn(),
  transaction: vi.fn(),
  updateRoleAssignment: vi.fn(),
  createRoleAssignments: vi.fn(),
  updateUser: vi.fn(),
  createAuditEvent: vi.fn(),
  findUpdatedUser: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userRoleAssignment: {
      findFirst: mocks.findActorGrant,
      count: vi.fn(),
    },
    user: { findUnique: mocks.findUser },
    $transaction: mocks.transaction,
  },
}))

import { PUT } from '@/app/api/admin/users/[id]/roles/route'

const transactionClient = {
  userRoleAssignment: {
    update: mocks.updateRoleAssignment,
    createMany: mocks.createRoleAssignments,
  },
  user: {
    update: mocks.updateUser,
    findUniqueOrThrow: mocks.findUpdatedUser,
  },
  auditEvent: { create: mocks.createAuditEvent },
}

describe('admin user access tags API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.findActorGrant.mockResolvedValue({ id: 'grant-1' })
    mocks.findUser.mockResolvedValue({
      id: 'mentor-1',
      role: 'MENTOR',
      roleAssignments: [],
      enrollments: [],
      linkedSundaySchoolChild: null,
      guardianOfChildren: [],
      sundaySchoolServing: [],
      mentorAssignments: [{ id: 'mentor-assignment-1' }],
    })
    mocks.findUpdatedUser.mockResolvedValue({
      id: 'mentor-1',
      role: 'MENTOR',
      roleAssignments: [],
    })
    mocks.transaction.mockImplementation(
      async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)
    )
  })

  it('allows a mentor-only user with active mentees to have no ministry access tags', async () => {
    const request = new Request('http://localhost/api/admin/users/mentor-1/roles', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleTags: [] }),
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'mentor-1' }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      id: 'mentor-1',
      role: 'MENTOR',
      roleTags: [],
    })
    expect(mocks.updateUser).not.toHaveBeenCalled()
  })
  it('clears the saved View as permission when the Priest tag is removed', async () => {
    mocks.findUser.mockResolvedValue({
      id: 'priest', role: 'PRIEST', roleAssignments: [{ id: 'grant', tag: 'PRIEST' }],
      enrollments: [], linkedSundaySchoolChild: null, guardianOfChildren: [], sundaySchoolServing: [], mentorAssignments: [],
    })
    const response = await PUT(new Request('http://localhost/api/admin/users/priest/roles', {
      method: 'PUT', body: JSON.stringify({ roleTags: ['SERVANTS_PREP_SERVANT'] }),
    }), { params: Promise.resolve({ id: 'priest' }) })
    expect(response.status).toBe(200)
    expect(mocks.updateUser).toHaveBeenCalledWith({ where: { id: 'priest' }, data: { role: 'SERVANT_PREP', canUseViewAs: false } })
  })

})
