import { RoleTag } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), transaction: vi.fn(), lock: vi.fn(), match: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.access }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/sunday-school-family-matching', () => ({ lockFamilyMatching: mocks.lock, matchSundaySchoolFamilies: mocks.match }))
import { POST } from '@/app/api/sunday-school/families/match/route'

describe('existing family reconciliation API', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.access.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    mocks.transaction.mockImplementation(callback => callback({ testTransaction: true }))
    mocks.match.mockResolvedValue({ matchedFamilies: 1, linkedChildren: 2, filledFields: 1, conflicts: 0 })
  })
  it('checks current ministry authority and returns counts without contact details', async () => {
    const response = await POST()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ matchedFamilies: 1, linkedChildren: 2, filledFields: 1, conflicts: 0 })
    expect(mocks.access).toHaveBeenCalledWith('admin')
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.match.mock.invocationCallOrder[0])
    expect(mocks.match).toHaveBeenCalledWith({ testTransaction: true }, { actorUserId: 'admin' })
  })
  it.each([
    { disabled: false, readOnly: false, roleTags: new Set() },
    { disabled: true, readOnly: false, roleTags: new Set([RoleTag.SUPER_ADMIN]) },
    { disabled: false, readOnly: true, roleTags: new Set([RoleTag.PRIEST]) },
  ])('denies insufficient authority: %o', async access => {
    mocks.access.mockResolvedValue(access)
    expect((await POST()).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('denies signed-out requests', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await POST()).status).toBe(401)
    expect(mocks.match).not.toHaveBeenCalled()
  })
})
