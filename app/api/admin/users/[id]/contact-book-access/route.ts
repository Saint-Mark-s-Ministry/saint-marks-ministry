import { AuditEventResult, RoleTag } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAuth()
    const session = await getServerSession(authOptions)
    if (session?.impersonating) {
      return NextResponse.json({ error: 'ViewAsReadOnly' }, { status: 403 })
    }
    const context = await getAuthorizationContext(actor.id)
    if (context.disabled || context.readOnly || !context.roleTags.has(RoleTag.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Only active Super Admins can change contact book access' }, { status: 403 })
    }

    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('canAccessContactBook' in body) || typeof body.canAccessContactBook !== 'boolean') {
      return NextResponse.json({ error: 'canAccessContactBook must be a boolean' }, { status: 400 })
    }
    const enabled = body.canAccessContactBook
    const { id } = await params
    const user = await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({ where: { id }, select: { canAccessContactBook: true } })
      if (!target) throw new Error('Not found')
      const updated = await tx.user.update({
        where: { id },
        data: { canAccessContactBook: enabled },
        select: { id: true, canAccessContactBook: true },
      })
      if (target.canAccessContactBook !== enabled) {
        await tx.auditEvent.create({ data: {
          actorUserId: actor.id,
          action: enabled ? 'CONTACT_BOOK_ACCESS_GRANTED' : 'CONTACT_BOOK_ACCESS_REVOKED',
          entityType: 'User',
          entityId: id,
          result: AuditEventResult.SUCCESS,
          metadata: { previous: target.canAccessContactBook, canAccessContactBook: enabled },
        } })
      }
      return updated
    })
    return NextResponse.json(user)
  } catch (error) {
    return handleApiError(error)
  }
}
