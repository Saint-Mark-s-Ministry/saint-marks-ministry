import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { canAdministerSundaySchool } from '@/lib/roles'
import {
  getSundaySchoolAccess,
  type SundaySchoolAccess,
} from '@/lib/sunday-school-access'
import { canModerateFeedback } from '@/lib/sunday-school-feedback'
import type { UserRole } from '@prisma/client'

/**
 * Machine credentials for the feedback MCP server (/api/mcp).
 *
 * A token acts as the SUPER_ADMIN who owns it. Only a SHA-256 hash is stored
 * (tokens are 256 bits of randomness, so a fast hash is appropriate). Authority
 * is re-derived from the database on every request: demoting the owner or
 * revoking/expiring the token takes effect immediately.
 */

export const MCP_TOKEN_PREFIX = 'smk_mcp_'

export function generateMcpToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${MCP_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return {
    token,
    tokenHash: hashMcpToken(token),
    tokenPrefix: token.slice(0, MCP_TOKEN_PREFIX.length + 6),
  }
}

export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function parseBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  const token = match?.[1]
  return token?.startsWith(MCP_TOKEN_PREFIX) ? token : null
}

export interface McpAuthContext {
  tokenId: string
  user: { id: string; role: UserRole; name: string }
  access: SundaySchoolAccess
}

export type McpAuthResult =
  | { ok: true; context: McpAuthContext }
  | { ok: false; status: 401 | 403; error: string }

export async function authenticateMcpToken(header: string | null): Promise<McpAuthResult> {
  const token = parseBearerToken(header)
  if (!token) return { ok: false, status: 401, error: 'Missing or malformed bearer token' }

  const record = await prisma.mcpApiToken.findUnique({
    where: { tokenHash: hashMcpToken(token) },
    select: {
      id: true,
      revokedAt: true,
      expiresAt: true,
      user: { select: { id: true, role: true, name: true } },
    },
  })
  if (
    !record ||
    record.revokedAt ||
    (record.expiresAt && record.expiresAt.getTime() <= Date.now())
  ) {
    return { ok: false, status: 401, error: 'Invalid, revoked, or expired token' }
  }

  // Re-derive authority from the current role, never from when the token was made.
  if (!canAdministerSundaySchool(record.user.role)) {
    return { ok: false, status: 403, error: 'Token owner is no longer an administrator' }
  }
  const access = await getSundaySchoolAccess(record.user)
  if (!canModerateFeedback(access)) {
    return { ok: false, status: 403, error: 'Token owner cannot moderate feedback' }
  }

  // Best-effort; never fail a request over a bookkeeping write.
  prisma.mcpApiToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined)

  return { ok: true, context: { tokenId: record.id, user: record.user, access } }
}
