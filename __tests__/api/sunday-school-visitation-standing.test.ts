import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), session: vi.fn(), classes: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/notifications', () => ({ notifyPriestNoteCreated: vi.fn() }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: vi.fn().mockResolvedValue({ isAdmin: true, canRead: true, readOnly: false }),
  visibleClassFilter: vi.fn().mockReturnValue(undefined),
  canServeClass: vi.fn().mockReturnValue(true),
  canViewClass: vi.fn().mockReturnValue(true),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolClass: { findMany: mocks.classes }, sundaySchoolSession: { findMany: async () => [] } } }))
import { GET } from '@/app/api/sunday-school/visitations/route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'user' })
  mocks.session.mockResolvedValue({})
  mocks.classes.mockResolvedValue([{ id: 'class-1', children: [] }])
})

describe('confidential-note visibility in the visitation workspace', () => {
  it.each([
    { tags: [RoleTag.SUPER_ADMIN], allowed: false, priest: false },
    { tags: [RoleTag.SUPER_ADMIN, RoleTag.PRIEST], allowed: false, priest: false },
    { tags: [RoleTag.PRIEST], allowed: true, priest: true },
    { tags: [RoleTag.SUNDAY_SCHOOL_SERVANT], allowed: true, priest: false },
  ])('returns current confidential access for $tags', async ({ tags, allowed, priest }) => {
    mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set(tags) })
    const response = await GET(new Request('http://localhost/api/sunday-school/visitations'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.standing).toMatchObject({ canReadPrivateNotes: allowed, isPriest: priest })
    expect(body.classes[0].canEdit).toBe(true)
    // Shared history must never select confidential content.
    expect(JSON.stringify(mocks.classes.mock.calls[0][0])).not.toContain('priestNotes')
  })

  it('hides confidential history when a Super Admin views as a priest', async () => {
    mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set([RoleTag.PRIEST]) })
    mocks.session.mockResolvedValue({ impersonating: { originalId: 'admin' } })
    const body = await (await GET(new Request('http://localhost/api/sunday-school/visitations'))).json()
    expect(body.standing).toMatchObject({ canReadPrivateNotes: false, isPriest: false })
  })
})
