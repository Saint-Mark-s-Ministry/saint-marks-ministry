import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ authOptions: {} }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/admin/view-as/users/route'

const mockGetServerSession = vi.mocked(getServerSession)
const mockFindUnique = vi.mocked(prisma.user.findUnique)
const mockFindMany = vi.mocked(prisma.user.findMany)

const activeActor = {
  role: UserRole.SUPER_ADMIN,
  isDisabled: false,
  roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }],
}

describe('GET /api/admin/view-as/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires authentication', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const response = await GET(new Request('https://example.test/api/admin/view-as/users'))

    expect(response.status).toBe(401)
  })

  it('requires an active Super Admin grant', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'servant-1', role: UserRole.SERVANT_PREP },
      expires: '',
    } as never)
    mockFindUnique.mockResolvedValue({
      role: UserRole.SERVANT_PREP,
      isDisabled: false,
      roleAssignments: [],
    } as never)

    const response = await GET(new Request('https://example.test/api/admin/view-as/users'))

    expect(response.status).toBe(403)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('uses the original actor while View as mode is active', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'student-1', role: UserRole.STUDENT },
      impersonating: {
        originalId: 'admin-1',
        originalName: 'Admin',
        originalEmail: 'admin@example.test',
        expiresAt: Date.now() + 60_000,
        readOnly: true,
      },
      expires: '',
    } as never)
    mockFindUnique.mockResolvedValue(activeActor as never)
    mockFindMany.mockResolvedValue([
      {
        id: 'student-1',
        name: 'Student',
        email: 'student@example.test',
        role: UserRole.STUDENT,
        roleAssignments: [{ tag: RoleTag.SERVANTS_PREP_STUDENT }],
      },
    ] as never)

    const response = await GET(new Request('https://example.test/api/admin/view-as/users?search=student'))

    expect(response.status).toBe(200)
    expect(mockFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'admin-1' } }))
    await expect(response.json()).resolves.toHaveLength(1)
  })

  it.each([true, false])('requires the priest permission to be enabled: %s', async enabled => {
    mockGetServerSession.mockResolvedValue({ user: { id: 'priest' } } as never)
    mockFindUnique.mockResolvedValue({ role: UserRole.PRIEST, isDisabled: false, canUseViewAs: enabled, roleAssignments: [{ tag: RoleTag.PRIEST }] } as never)
    mockFindMany.mockResolvedValue([])
    expect((await GET(new Request('https://example.test/api/admin/view-as/users'))).status).toBe(enabled ? 200 : 403)
  })

  it('caps the number of returned candidates', async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: 'admin-1', role: UserRole.SUPER_ADMIN },
      expires: '',
    } as never)
    mockFindUnique.mockResolvedValue(activeActor as never)
    mockFindMany.mockResolvedValue([])

    await GET(new Request('https://example.test/api/admin/view-as/users?limit=500'))

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }))
  })
})
