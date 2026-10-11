import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import bcrypt from "bcryptjs"
import { AuditEventResult } from "@prisma/client"
import { recordAuditEvent } from "@/lib/audit"
import { defaultDashboardPath } from "@/lib/dashboard-navigation"
import { emailPasswordChanged } from "@/lib/mail/notify"
import { MIN_PASSWORD_LENGTH } from "@/lib/password-reset"

// POST /api/auth/change-password - Change user's own password
export async function POST(request: Request) {
  try {
    const user = await requireAuth({ allowMustChangePassword: true })

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      )
    }

    // Get user with password
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      omit: { password: false }
    })

    if (!dbUser || !dbUser.password) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, dbUser.password)

    if (!isValid) {
      await recordAuditEvent({
        actorUserId: user.id,
        action: 'AUTH_PASSWORD_CHANGE',
        entityType: 'User',
        entityId: user.id,
        result: AuditEventResult.DENIED,
        reason: 'CURRENT_PASSWORD_INCORRECT',
      })
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      )
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update password and clear mustChangePassword flag
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
      }
    })

    await recordAuditEvent({
      actorUserId: user.id,
      action: 'AUTH_PASSWORD_CHANGE',
      entityType: 'User',
      entityId: user.id,
      result: AuditEventResult.SUCCESS,
    })
    // Replacing a temporary password is the account's first real password; nothing to warn about.
    if (!dbUser.mustChangePassword) emailPasswordChanged({ email: dbUser.email, name: dbUser.name })

    return NextResponse.json({
      message: "Password updated successfully",
      destination: defaultDashboardPath(user),
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update password" },
      { status: 500 }
    )
  }
}
