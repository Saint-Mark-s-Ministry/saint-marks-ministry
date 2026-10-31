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
    const context = await getAuthorizationContext(actor.id)
    if (session?.impersonating || context.disabled || context.readOnly ||
      context.roleTags.has(RoleTag.PRIEST) || !context.roleTags.has(RoleTag.SUPER_ADMIN)) {
      return NextResponse.json({ error: 'Only active Super Admins can change makeup exam notifications' }, { status: 403 })
    }
    const body: unknown = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || !('makeupExamNotifications' in body) || typeof body.makeupExamNotifications !== 'boolean') {
      return NextResponse.json({ error: 'makeupExamNotifications must be a boolean' }, { status: 400 })
    }
    const enabled = body.makeupExamNotifications
    const { id } = await params
    const user = await prisma.$transaction(async tx => {
      const target = await tx.user.findUnique({ where: { id }, select: {
        makeupExamNotifications: true, isDisabled: true,
        roleAssignments: { where: { revokedAt: null }, select: { tag: true } },
      } })
      if (!target) throw new Error('Not found')
      const staff = target.roleAssignments.some(r => r.tag === RoleTag.SUPER_ADMIN || r.tag === RoleTag.SERVANTS_PREP_SERVANT || r.tag === RoleTag.PRIEST)
      if (enabled && (target.isDisabled || !staff)) return null
      const updated = await tx.user.update({ where: { id }, data: { makeupExamNotifications: enabled }, select: { id: true, makeupExamNotifications: true } })
      if (target.makeupExamNotifications !== enabled) await tx.auditEvent.create({ data: {
        actorUserId: actor.id, action: 'MAKEUP_EXAM_NOTIFICATIONS_UPDATED',
        entityType: 'User', entityId: id, result: AuditEventResult.SUCCESS,
        metadata: { previous: target.makeupExamNotifications, makeupExamNotifications: enabled },
      } })
      return updated
    })
    if (!user) return NextResponse.json({ error: 'Notifications require an enabled account with Servants Prep staff or priest access' }, { status: 400 })
    return NextResponse.json(user)
  } catch (error) { return handleApiError(error) }
}
