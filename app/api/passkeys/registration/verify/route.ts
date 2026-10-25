import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { registerPasskey, passkeyCookieName, limitPasskeyRequests } from '@/lib/passkeys'
import { PasskeyError } from '@/lib/passkey-config'
import { passkeyApiError, passkeyBody, passkeyJson, requirePasskeyOwner } from '@/lib/passkey-api'
import { recordAuditEvent } from '@/lib/audit'
import { AuditEventResult } from '@prisma/client'

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  response: z.object({ id: z.string().min(1).max(2048), response: z.object({}).passthrough(), type: z.literal('public-key') }).passthrough(),
})

export async function POST(req: NextRequest) {
  try {
    const body = schema.safeParse(await passkeyBody(req))
    if (!body.success) throw new PasskeyError('Enter a passkey name (up to 80 characters) and a valid passkey response.')
    const user = await requirePasskeyOwner(true)
    await limitPasskeyRequests(`register-verify:${user.id}`, 10)
    await registerPasskey(user, req.cookies.get(passkeyCookieName('register'))?.value, body.data.response as unknown as RegistrationResponseJSON, body.data.name)
    await recordAuditEvent({ actorUserId: user.id, action: 'AUTH_PASSKEY_ADDED', entityType: 'User', entityId: user.id, result: AuditEventResult.SUCCESS })
    const res = passkeyJson({ success: true })
    res.cookies.set(passkeyCookieName('register'), '', { path: '/', maxAge: 0, secure: process.env.PASSKEY_ORIGIN?.startsWith('https:'), httpOnly: true, sameSite: 'strict' })
    return res
  } catch (error) { return passkeyApiError(error) }
}
