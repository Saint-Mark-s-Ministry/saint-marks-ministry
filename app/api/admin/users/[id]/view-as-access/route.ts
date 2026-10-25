import { AuditEventResult, RoleTag, UserRole } from '@prisma/client'
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
    if (actor.role !== UserRole.SUPER_ADMIN || context.disabled || context.roleTags.has(RoleTag.PRIEST) || !context.roleTags.has(RoleTag.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Only active Super Admins can change View as access' }, { status: 403 })
    }
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('canUseViewAs' in body) || typeof body.canUseViewAs !== 'boolean') {
      return NextResponse.json({ error: 'canUseViewAs must be a boolean' }, { status: 400 })
    }
    const enabled = body.canUseViewAs
    const { id } = await params
    const user = await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { canUseViewAs: true, isDisabled: true },
      })
      if (!target) throw new Error('Not found')
      if (enabled && target.isDisabled) {
        return null
      }
      const updated = await tx.user.update({ where: { id }, data: { canUseViewAs: enabled }, select: { id: true, canUseViewAs: true } })
      if (target.canUseViewAs !== enabled) {
        await tx.auditEvent.create({ data: {
          actorUserId: actor.id,
          action: enabled ? 'VIEW_AS_ACCESS_GRANTED' : 'VIEW_AS_ACCESS_REVOKED',
          entityType: 'User', entityId: id, result: AuditEventResult.SUCCESS,
          metadata: { previous: target.canUseViewAs, canUseViewAs: enabled },
        } })
      }
      return updated
    })
    if (!user) return NextResponse.json({ error: 'View as access can only be granted to active accounts' }, { status: 400 })
    return NextResponse.json(user)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
