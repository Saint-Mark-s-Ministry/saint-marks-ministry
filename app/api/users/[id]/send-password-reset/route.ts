import { NextResponse } from "next/server"
import { AuditEventResult } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { isSuperAdmin } from "@/lib/roles"
import { handleApiError } from "@/lib/api-utils"
import { recordAuditEvent } from "@/lib/audit"
import { checkRateLimit } from "@/lib/rate-limit"
import { emailPasswordReset } from "@/lib/mail/notify"

/**
 * POST /api/users/[id]/send-password-reset (SUPER_ADMIN only)
 * Emails the user the same one-hour reset link as "Forgot password?". The
 * password is untouched until the user follows the link, so this can't lock
 * anyone out, and the link reaches only the account's own inbox.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth()
    if (!isSuperAdmin(currentUser.role)) {
      return NextResponse.json(
        { error: "Only super admins can send password reset emails" },
        { status: 403 }
      )
    }

    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, authVersion: true, isDisabled: true },
    })
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    if (user.isDisabled) {
      return NextResponse.json(
        { error: "This account is disabled. Enable it before sending a reset email." },
        { status: 400 }
      )
    }

    // Same budget as the public forgot-password flow, so the button can't be
    // used to flood someone's inbox.
    const limit = await checkRateLimit(`admin-reset:${user.id}`, 3, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reset emails for this user. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 900) } }
      )
    }

    emailPasswordReset(user)

    await recordAuditEvent({
      actorUserId: currentUser.id,
      action: "user.password_reset_email.send",
      entityType: "User",
      entityId: user.id,
      result: AuditEventResult.SUCCESS,
      metadata: { targetName: user.name, targetEmail: user.email },
    })

    return NextResponse.json({ message: `Password reset email sent to ${user.email}` })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
