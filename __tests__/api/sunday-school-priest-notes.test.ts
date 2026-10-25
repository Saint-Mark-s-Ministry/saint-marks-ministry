import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAuthorizationContext: vi.fn(),
  findChild: vi.fn(),
  findNotes: vi.fn(),
  session: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/authorization', () => ({
  getAuthorizationContext: mocks.getAuthorizationContext,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolChild: { findUnique: mocks.findChild },
    sundaySchoolPriestNote: { findMany: mocks.findNotes },
  },
}))

import { GET } from '@/app/api/sunday-school/priest-notes/route'

describe('Sunday School priest-note reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.session.mockResolvedValue({})
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getAuthorizationContext.mockResolvedValue({
      disabled: false,
      roleTags: new Set([RoleTag.PRIEST]),
    })
    mocks.findChild.mockResolvedValue({ id: 'child-1' })
    mocks.findNotes.mockResolvedValue([])
  })

  it.each([{ tags: [RoleTag.SUPER_ADMIN] }, { tags: [RoleTag.SUPER_ADMIN, RoleTag.PRIEST] }])('denies Super Admin access regardless of authorship or additional tags: %j', async ({ tags }) => {
    mocks.requireAuth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.getAuthorizationContext.mockResolvedValue({ disabled: false, roleTags: new Set(tags) })
    const response = await GET(new Request('http://localhost/api/sunday-school/priest-notes?childId=child-1'))
    expect(response.status).toBe(403)
    expect(mocks.findChild).not.toHaveBeenCalled()
    expect(mocks.findNotes).not.toHaveBeenCalled()
  })

  it('denies a Super Admin viewing as a priest', async () => {
    mocks.session.mockResolvedValue({ impersonating: { originalId: 'admin' } })
    const response = await GET(new Request('http://localhost/api/sunday-school/priest-notes?childId=child-1'))
    expect(response.status).toBe(403)
    expect(mocks.findNotes).not.toHaveBeenCalled()
  })

  it('restricts a non-priest to notes they personally authored', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getAuthorizationContext.mockResolvedValue({
      disabled: false,
      roleTags: new Set([RoleTag.SUNDAY_SCHOOL_SERVANT]),
    })
    mocks.findNotes.mockResolvedValue([{ id: 'own-note', content: 'My private note' }])

    const response = await GET(
      new Request('http://localhost/api/sunday-school/priest-notes?childId=child-1')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      notes: [{ id: 'own-note', content: 'My private note' }],
    })
    expect(mocks.findNotes).toHaveBeenCalledWith(expect.objectContaining({
      where: { visitation: { childId: 'child-1' }, authorId: 'servant-1' },
    }))
    expect(mocks.findChild).not.toHaveBeenCalled()
  })

  it('refuses a disabled priest before looking up the child', async () => {
    mocks.getAuthorizationContext.mockResolvedValue({
      disabled: true,
      roleTags: new Set([RoleTag.PRIEST]),
    })

    const response = await GET(
      new Request('http://localhost/api/sunday-school/priest-notes?childId=child-1')
    )

    expect(response.status).toBe(403)
    expect(mocks.findChild).not.toHaveBeenCalled()
    expect(mocks.findNotes).not.toHaveBeenCalled()
  })

  it('returns all private notes attached to the child\'s visitations for an active priest', async () => {
    mocks.findNotes.mockResolvedValue([{ id: 'note-1', content: 'Private' }])

    const response = await GET(
      new Request('http://localhost/api/sunday-school/priest-notes?childId=child-1')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ notes: [{ id: 'note-1', content: 'Private' }] })
    expect(mocks.findNotes).toHaveBeenCalledWith(expect.objectContaining({
      where: { visitation: { childId: 'child-1' } },
    }))
  })
})
