// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'
const mock = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), context: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mock.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mock.user } } }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mock.context }))
import { requirePrepGuideViewer } from '@/lib/sp-guide-auth'
beforeEach(() => {
  vi.resetAllMocks()
  mock.session.mockResolvedValue({ id: 'viewer', authVersion: 3, role: 'SUPER_ADMIN' })
  mock.user.mockResolvedValue({ isDisabled: false, mustChangePassword: false, authVersion: 3 })
  mock.context.mockResolvedValue({ disabled: false, roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]) })
})
describe('SP guide current database authorization', () => {
  it.each([RoleTag.SUPER_ADMIN, RoleTag.PRIEST, RoleTag.SERVANTS_PREP_SERVANT])('accepts an active %s tag', async tag => {
    mock.context.mockResolvedValue({ disabled: false, roleTags: new Set([tag]) })
    await expect(requirePrepGuideViewer()).resolves.toMatchObject({ disabled: false })
    expect(mock.context).toHaveBeenCalledWith('viewer')
  })
  it('does not grant access from a stale privileged JWT role', async () => {
    mock.context.mockResolvedValue({ disabled: false, roleTags: new Set([RoleTag.SUNDAY_SCHOOL_SERVANT]) })
    await expect(requirePrepGuideViewer()).rejects.toThrow('Forbidden')
  })
  it.each(['missing', 'disabled', 'revoked-session', 'password-change'])('rejects %s accounts', async scenario => {
    if (scenario === 'missing') mock.user.mockResolvedValue(null)
    if (scenario === 'disabled') mock.user.mockResolvedValue({ isDisabled: true, authVersion: 3 })
    if (scenario === 'revoked-session') mock.user.mockResolvedValue({ isDisabled: false, authVersion: 4 })
    if (scenario === 'password-change') mock.user.mockResolvedValue({ isDisabled: false, authVersion: 3, mustChangePassword: true })
    await expect(requirePrepGuideViewer()).rejects.toThrow()
  })
})
