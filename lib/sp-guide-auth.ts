import 'server-only'
import { requireAuth } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { getAuthorizationContext } from '@/lib/authorization'
import { canViewPrepGuides } from '@/lib/sp-guide-access'

export async function requirePrepGuideViewer() {
  const session = await requireAuth()
  const user = await prisma.user.findUnique({ where: { id: session.id }, select: { isDisabled: true, mustChangePassword: true, authVersion: true } })
  if (!user || user.isDisabled || user.authVersion !== session.authVersion) throw new Error('Unauthorized')
  if (user.mustChangePassword) throw new Error('Forbidden')
  const context = await getAuthorizationContext(session.id)
  if (context.disabled || !canViewPrepGuides(context.roleTags)) throw new Error('Forbidden')
  return context
}
