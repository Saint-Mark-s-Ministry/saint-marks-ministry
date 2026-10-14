import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { AuditEventResult, Prisma, UserRole } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { recordAuditEvent } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { deleteUserWithRelations, UserDeletionConflictError } from '@/lib/user-deletion'

const headers = { 'Cache-Control': 'private, no-store' }

/**
 * POST /api/account/delete: a signed-in person permanently deletes their own
 * account. Required for the iOS app (App Store guideline 5.1.1(v)).
 *
 * This is deliberately nothing new: it runs the same deleteUserWithRelations
 * an administrator already uses on a user (DELETE /api/users/[id]), with the
 * same protections. A person whose account holds records that must be kept
 * (confidential priest notes, roster import history) gets the same 409 an
 * admin would and is told to contact an administrator, who can disable the
 * account instead.
 *
 * Extra guards, because the person is acting on themselves:
 * - the current password is required;
 * - View As is read-only, so an admin can never delete the person they are viewing;
 * - a super administrator can't remove their own account (no last-admin lockout).
 */
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const session = await getServerSession(authOptions)
    if (session?.impersonating) {
      return NextResponse.json({ error: 'ViewAsReadOnly' }, { status: 403, headers })
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return NextResponse.json(
        { error: "Super administrators can't delete their own account. Ask another super administrator to do it." },
        { status: 403, headers },
      )
    }

    const body: unknown = await request.json().catch(() => null)
    const password = body && typeof body === 'object' && 'password' in body ? body.password : null
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Enter your password to delete your account' }, { status: 400, headers })
    }

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, omit: { password: false } })
    if (!dbUser?.password || !(await bcrypt.compare(password, dbUser.password))) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: 'account.self_delete',
        entityType: 'User',
        entityId: user.id,
        result: AuditEventResult.DENIED,
        reason: 'PASSWORD_INCORRECT',
      })
      // 403, not 401: the native client treats a 401 outside /api/auth/ as an expired
      // session and signs the person out, which a mistyped password must not do.
      return NextResponse.json({ error: 'That password is incorrect' }, { status: 403, headers })
    }

    await prisma.$transaction(tx => deleteUserWithRelations(tx, user.id))

    // The actor row is gone, so the event stands on its own and carries no name or email.
    await recordAuditEvent({
      actorUserId: null,
      action: 'account.self_delete',
      entityType: 'User',
      entityId: user.id,
      result: AuditEventResult.SUCCESS,
      metadata: { role: user.role },
    })

    return NextResponse.json({ message: 'Your account has been deleted' }, { headers })
  } catch (error: unknown) {
    if (error instanceof UserDeletionConflictError) {
      return NextResponse.json(
        {
          error: `Your account can't be deleted in the app because it holds records the church must keep (${error.message
            .replace(/^This user cannot be deleted because they have /, '')
            .replace(/\. Disable the account instead.*$/, '')}). Contact an administrator and they can close the account for you.`,
        },
        { status: 409, headers },
      )
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json(
        { error: "Your account still has linked records and can't be deleted in the app. Contact an administrator and they can close the account for you." },
        { status: 409, headers },
      )
    }
    const response = handleApiError(error)
    response.headers.set('Cache-Control', 'private, no-store')
    return response
  }
}
