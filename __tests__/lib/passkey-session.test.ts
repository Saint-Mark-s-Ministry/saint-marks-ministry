// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { JWT } from 'next-auth/jwt'
import { UserRole } from '@prisma/client'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: vi.fn() }))
import { authOptions } from '@/lib/auth'

const token = (): JWT => ({ id: 'user-1', role: UserRole.SERVANT, mustChangePassword: false, isAsyncStudent: false, authVersion: 3, authenticatedAt: 12345, validatedAt: Date.now() })

describe('passkey session freshness', () => {
  it('client session updates cannot reset the sign-in timestamp or auth version', async () => {
    const jwt = authOptions.callbacks!.jwt!
    const result = await jwt({ token: token(), trigger: 'update', session: { authenticatedAt: Date.now(), authVersion: 99 }, user: undefined, account: null } as never)
    expect(result.authenticatedAt).toBe(12345)
    expect(result.authVersion).toBe(3)
  })
  it('ordinary session access preserves the original sign-in time', async () => {
    const result = await authOptions.callbacks!.jwt!({ token: token(), user: undefined, account: null } as never)
    expect(result.authenticatedAt).toBe(12345)
  })
  it.each(['credentials', 'passkey'])('sets a fresh timestamp on real %s sign-in', async provider => {
    const before = Date.now()
    const result = await authOptions.callbacks!.jwt!({ token: token(), user: { id: 'user-1', role: UserRole.SERVANT, authVersion: 3 }, account: { provider } } as never)
    expect(result.authenticatedAt).toBeGreaterThanOrEqual(before)
    expect(result.authVersion).toBe(3)
  })
})
