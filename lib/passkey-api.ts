import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { assertPasskeyOrigin, assertRecentPasskeyLogin, getPasskeyConfig, PasskeyError } from '@/lib/passkey-config'
import { PASSKEY_CHALLENGE_SECONDS, passkeyCookieName } from '@/lib/passkeys'

export async function requirePasskeyOwner(recent = false) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.impersonating) throw new PasskeyError('Unauthorized', 401)
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user || user.isDisabled || user.authVersion !== session.user.authVersion) throw new PasskeyError('Unauthorized', 401)
  if (user.mustChangePassword) throw new PasskeyError('Change your password before managing passkeys.', 403)
  if (recent) assertRecentPasskeyLogin(session.authenticatedAt)
  return user
}

export function passkeyJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function passkeyApiError(error: unknown) {
  if (error instanceof PasskeyError) return passkeyJson({ error: error.message }, error.status)
  return handleApiError(error)
}

export async function passkeyBody(req: NextRequest) {
  assertPasskeyOrigin(req.headers.get('origin'))
  if (!req.headers.get('content-type')?.startsWith('application/json')) throw new PasskeyError('Expected JSON.', 415)
  const body = await req.text()
  if (body.length > 32_768) throw new PasskeyError('Request too large.', 413)
  try { return JSON.parse(body) as unknown } catch { throw new PasskeyError('Invalid JSON.') }
}

export function challengeResponse(options: unknown, token: string, purpose: 'register' | 'authenticate') {
  const res = passkeyJson(options)
  res.cookies.set(passkeyCookieName(purpose), token, {
    httpOnly: true, secure: getPasskeyConfig().secure, sameSite: 'strict', path: '/', maxAge: PASSKEY_CHALLENGE_SECONDS,
  })
  return res
}
