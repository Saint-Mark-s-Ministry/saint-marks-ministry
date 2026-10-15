// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), user: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), audit: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user }, passkey: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } } }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))

import { GET, DELETE } from '@/app/api/passkeys/route'
import { requirePasskeyOwner } from '@/lib/passkey-api'

const user = { id: 'user-1', authVersion: 2, isDisabled: false, mustChangePassword: false }
const request = (origin = 'https://app.example.test', body: unknown = { id: 'key-1' }) => new NextRequest('https://app.example.test/api/passkeys', {
  method: 'DELETE', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('PASSKEY_RP_ID', 'example.test')
  vi.stubEnv('PASSKEY_ORIGIN', 'https://app.example.test')
  mocks.session.mockResolvedValue({ user: { id: user.id, authVersion: 2 }, authenticatedAt: Date.now() })
  mocks.user.mockResolvedValue(user)
  mocks.findMany.mockResolvedValue([])
  mocks.deleteMany.mockResolvedValue({ count: 1 })
})

describe('passkey owner authorization', () => {
  it.each(['signed-out', 'disabled', 'stale-version', 'password-change', 'impersonating', 'missing-freshness', 'old-login'])('rejects %s management', async scenario => {
    if (scenario === 'signed-out') mocks.session.mockResolvedValue(null)
    if (scenario === 'disabled') mocks.user.mockResolvedValue({ ...user, isDisabled: true })
    if (scenario === 'stale-version') mocks.user.mockResolvedValue({ ...user, authVersion: 3 })
    if (scenario === 'password-change') mocks.user.mockResolvedValue({ ...user, mustChangePassword: true })
    if (scenario === 'impersonating') mocks.session.mockResolvedValue({ user, authenticatedAt: Date.now(), impersonating: { originalId: 'admin' } })
    if (scenario === 'missing-freshness') mocks.session.mockResolvedValue({ user })
    if (scenario === 'old-login') mocks.session.mockResolvedValue({ user, authenticatedAt: Date.now() - 600_001 })
    await expect(requirePasskeyOwner(true)).rejects.toThrow()
  })
  it('lets an active user manage only their own authentication regardless of ministry role', async () => {
    await expect(requirePasskeyOwner(true)).resolves.toEqual(user)
    expect(mocks.user).toHaveBeenCalledWith({ where: { id: user.id } })
  })
})

describe('passkey management routes', () => {
  it('lists only the owner’s current-domain passkeys with safe fields', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { userId: user.id, rpID: 'example.test' }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    })
  })
  it('scopes deletion by owner and domain even if a different user ID is supplied', async () => {
    const res = await DELETE(request(undefined, { id: 'key-1', userId: 'victim' }))
    expect(res.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 'key-1', userId: user.id, rpID: 'example.test' } })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'AUTH_PASSKEY_REMOVED' }))
  })
  it('does not delete another user’s key', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 })
    expect((await DELETE(request())).status).toBe(404)
  })
  it('rejects cross-origin deletion before querying credentials', async () => {
    expect((await DELETE(request('https://evil.test'))).status).toBe(403)
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
  it('rejects malformed and oversized requests', async () => {
    expect((await DELETE(request(undefined, {}))).status).toBe(400)
    expect((await DELETE(request(undefined, { id: 'x'.repeat(33_000) }))).status).toBe(413)
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
})
