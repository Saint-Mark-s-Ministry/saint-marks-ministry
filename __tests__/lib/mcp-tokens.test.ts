import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { mcpApiToken: { findUnique: mocks.findUnique, update: mocks.update } },
}))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
}))

import {
  authenticateMcpToken,
  generateMcpToken,
  hashMcpToken,
  parseBearerToken,
} from '@/lib/mcp-tokens'

const admin = { id: 'u1', role: 'SUPER_ADMIN', name: 'Admin' }

describe('mcp token helpers', () => {
  it('generates prefixed, hashed, unique tokens', () => {
    const a = generateMcpToken()
    const b = generateMcpToken()
    expect(a.token.startsWith('smk_mcp_')).toBe(true)
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).toBe(hashMcpToken(a.token))
    expect(a.tokenHash).not.toContain(a.token)
  })

  it('parses only well-formed bearer tokens', () => {
    expect(parseBearerToken('Bearer smk_mcp_abc')).toBe('smk_mcp_abc')
    expect(parseBearerToken('bearer smk_mcp_abc')).toBe('smk_mcp_abc')
    expect(parseBearerToken('Bearer other_abc')).toBeNull()
    expect(parseBearerToken('Basic smk_mcp_abc')).toBeNull()
    expect(parseBearerToken(null)).toBeNull()
  })
})

describe('authenticateMcpToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.update.mockResolvedValue({})
    mocks.getSundaySchoolAccess.mockResolvedValue({ isAdmin: true })
  })

  const header = 'Bearer smk_mcp_valid'

  it('rejects a missing token with 401', async () => {
    expect(await authenticateMcpToken(null)).toMatchObject({ ok: false, status: 401 })
    expect(mocks.findUnique).not.toHaveBeenCalled()
  })

  it('looks tokens up by hash, never plaintext', async () => {
    mocks.findUnique.mockResolvedValue(null)
    await authenticateMcpToken(header)
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: hashMcpToken('smk_mcp_valid') } })
    )
  })

  it.each([
    ['unknown', null],
    ['revoked', { id: 't', revokedAt: new Date(), expiresAt: null, user: admin }],
    ['expired', { id: 't', revokedAt: null, expiresAt: new Date(Date.now() - 1000), user: admin }],
  ])('rejects %s tokens with 401', async (_label, record) => {
    mocks.findUnique.mockResolvedValue(record)
    expect(await authenticateMcpToken(header)).toMatchObject({ ok: false, status: 401 })
  })

  it('rejects a token whose owner was demoted', async () => {
    mocks.findUnique.mockResolvedValue({
      id: 't',
      revokedAt: null,
      expiresAt: null,
      user: { ...admin, role: 'SERVANT_PREP' },
    })
    expect(await authenticateMcpToken(header)).toMatchObject({ ok: false, status: 403 })
  })

  it('accepts a live SUPER_ADMIN token and records usage', async () => {
    mocks.findUnique.mockResolvedValue({ id: 't', revokedAt: null, expiresAt: null, user: admin })
    const result = await authenticateMcpToken(header)
    expect(result).toMatchObject({ ok: true, context: { tokenId: 't', user: admin } })
    expect(mocks.update).toHaveBeenCalled()
  })
})
