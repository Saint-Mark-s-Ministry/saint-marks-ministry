import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getPasskeyConfig, PasskeyError } from '@/lib/passkey-config'
import { passkeyApiError, passkeyBody, passkeyJson, requirePasskeyOwner } from '@/lib/passkey-api'
import { recordAuditEvent } from '@/lib/audit'
import { AuditEventResult } from '@prisma/client'

export async function GET() {
  try {
    const { rpID } = getPasskeyConfig()
    const user = await requirePasskeyOwner()
    const passkeys = await prisma.passkey.findMany({
      where: { userId: user.id, rpID }, orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    })
    return passkeyJson({ passkeys })
  } catch (error) { return passkeyApiError(error) }
}

export async function DELETE(req: NextRequest) {
  try {
    const { rpID } = getPasskeyConfig()
    const body = z.object({ id: z.string().min(1).max(100) }).safeParse(await passkeyBody(req))
    if (!body.success) throw new PasskeyError('Invalid passkey.')
    const user = await requirePasskeyOwner(true)
    const deleted = await prisma.passkey.deleteMany({ where: { id: body.data.id, userId: user.id, rpID } })
    if (deleted.count !== 1) throw new PasskeyError('Passkey not found.', 404)
    await recordAuditEvent({ actorUserId: user.id, action: 'AUTH_PASSKEY_REMOVED', entityType: 'Passkey', entityId: body.data.id, result: AuditEventResult.SUCCESS })
    return passkeyJson({ success: true })
  } catch (error) { return passkeyApiError(error) }
}
