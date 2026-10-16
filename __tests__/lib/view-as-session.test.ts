// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'
import type { JWT } from 'next-auth/jwt'
const mocks = vi.hoisted(() => ({ user: vi.fn(), audit: vi.fn(), grants: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user }, userRoleAssignment: { findMany: mocks.grants }, auditEvent: { create: mocks.audit }, sundaySchoolServantAssignment: { findMany: vi.fn().mockResolvedValue([]) }, sundaySchoolAgeGroup: { findMany: vi.fn().mockResolvedValue([]) } } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: vi.fn() }))
import { authOptions } from '@/lib/auth'
const priest = { id: 'priest', name: 'Priest', email: 'priest@example.test', role: UserRole.PRIEST, isDisabled: false, mustChangePassword: false, canUseViewAs: true, canAccessContactBook: false, authVersion: 1, roleAssignments: [{ tag: RoleTag.PRIEST }] }
const target = { ...priest, id: 'target', name: 'Other user', canUseViewAs: false }
const token = (): JWT => ({ id: 'priest', role: UserRole.PRIEST, authVersion: 1, mustChangePassword: false, isAsyncStudent: false, validatedAt: Date.now() })
const jwt = (current: JWT, session?: object) => authOptions.callbacks!.jwt!({ token: current, ...(session ? { trigger: 'update', session } : {}), user: undefined, account: null } as never)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.grants.mockResolvedValue([])
  mocks.user.mockImplementation(async ({ where }) => where.id === 'priest' ? priest : target)
})
describe('priest View as sessions', () => {
  it('starts and stops a read-only preview using the current grant', async () => {
    const started = await jwt(token(), { impersonate: 'target' })
    expect(started).toMatchObject({ id: 'target', originalId: 'priest' })
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'ADMIN_VIEW_AS_STARTED', actorUserId: 'priest', metadata: { readOnly: true } }) })
    const stopped = await jwt(started, { impersonate: null })
    expect(stopped.id).toBe('priest')
    expect(stopped.originalId).toBeUndefined()
  })
  it('starts and stops a preview for an explicitly enabled parent without ministry tags', async () => {
    const parent = { ...priest, role: UserRole.PARENT, roleAssignments: [] }
    mocks.user.mockImplementation(async ({ where }) => where.id === 'priest' ? parent : target)
    const started = await jwt({ ...token(), role: UserRole.PARENT }, { impersonate: 'target' })
    expect(started).toMatchObject({ id: 'target', originalId: 'priest' })
    // Parent navigation has no ministry scope; it needs these empty resolver results on restore.
    const stopped = await jwt(started, { impersonate: null })
    expect(stopped).toMatchObject({ id: 'priest', role: UserRole.PARENT })
    expect(stopped.originalId).toBeUndefined()
  })
  it('cannot enable itself by submitting a session flag', async () => {
    mocks.user.mockResolvedValue({ ...priest, canUseViewAs: false })
    const denied = await jwt(token(), { canUseViewAs: true, impersonate: 'target' })
    expect(denied.id).toBe('priest')
    expect(denied.originalId).toBeUndefined()
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ result: 'DENIED' }) })
  })
  it.each([
    { canUseViewAs: false }, { isDisabled: true }, { mustChangePassword: true },
  ])('denies an active preview immediately after revocation: %j', async revoked => {
    const current = await jwt(token(), { impersonate: 'target' })
    mocks.user.mockImplementation(async ({ where }) => where.id === 'priest' ? { ...priest, ...revoked } : target)
    expect((await jwt(current)).invalidated).toBe(true)
  })
})
