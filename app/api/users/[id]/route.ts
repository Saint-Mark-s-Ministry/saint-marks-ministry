import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAuth } from "@/lib/auth-helpers"
import { AuditEventResult, Prisma, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"
import { canManageUsers, canManageAllUsers, canServantPrepManageRole } from "@/lib/roles"
import { normalizeEmail } from "@/lib/email"
import { recordAuditEvent } from "@/lib/audit"
import { deleteUserWithRelations, UserDeletionConflictError } from "@/lib/user-deletion"

// GET /api/users/[id] - Get a specific user
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth()
    const { id } = await params

    // Users can view their own profile, or admins can view anyone's
    if (currentUser.id !== id && !canManageUsers(currentUser.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        canAccessContactBook: true,
        profileImageUrl: true,
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
          orderBy: { grantedAt: 'asc' },
        },
        createdAt: true,
        updatedAt: true,
      }
    })

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    return NextResponse.json(user)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch user" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// PATCH /api/users/[id] - Update a user
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth()
    const { id } = await params
    const body = await request.json()
    if (Object.prototype.hasOwnProperty.call(body, 'canAccessContactBook')) {
      return NextResponse.json({ error: 'Use the contact book access endpoint to change this permission' }, { status: 403 })
    }
    const { email, name, phone, password, role, profileImageUrl } = body

    // Get the user being updated (with password, to verify self-service email changes)
    const targetUser = await prisma.user.findUnique({ where: { id }, omit: { password: false } })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // Users can update their own profile (name, email)
    const isSelf = currentUser.id === id
    const canManage = canManageUsers(currentUser.role)

    if (!isSelf && !canManage) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // SERVANT_PREP can only update Student, Mentor, and Sunday School Servant users
    if (currentUser.role === UserRole.SERVANT_PREP && !canServantPrepManageRole(targetUser.role)) {
      return NextResponse.json(
        { error: "Servants Prep can only update Student, Mentor, and Sunday School Servant users" },
        { status: 403 }
      )
    }

    const updateData: { email?: string; name?: string; phone?: string | null; profileImageUrl?: string | null; role?: UserRole; password?: string; mustChangePassword?: boolean } = {}

    if (email) {
      const trimmedEmail = normalizeEmail(email)
      const isEmailChange = trimmedEmail !== (targetUser.email ?? "").toLowerCase()
      // Self-service email changes require re-confirming the current password.
      // This prevents a hijacked session from rotating the victim's email to
      // an attacker-controlled address (which would otherwise survive password
      // resets and enable Google-account linking).
      if (isEmailChange && isSelf) {
        const { currentPassword } = body as { currentPassword?: string }
        if (!currentPassword || typeof currentPassword !== "string") {
          return NextResponse.json(
            { error: "Current password is required to change email" },
            { status: 400 }
          )
        }
        if (!targetUser.password) {
          return NextResponse.json(
            { error: "This account has no password set; cannot change email here" },
            { status: 400 }
          )
        }
        const passwordOk = await bcrypt.compare(currentPassword, targetUser.password)
        if (!passwordOk) {
          return NextResponse.json(
            { error: "Current password is incorrect" },
            { status: 401 }
          )
        }
      }
      updateData.email = trimmedEmail
    }
    if (name) updateData.name = name
    if (phone !== undefined) updateData.phone = phone || null
    if (profileImageUrl !== undefined) updateData.profileImageUrl = profileImageUrl || null

    // Role change permissions:
    // - SUPER_ADMIN: Uses the normalized access-tag endpoint so the legacy
    //   compatibility role and historical grants cannot drift apart
    // - SERVANT_PREP: Can only change between STUDENT and MENTOR
    if (role) {
      if (canManageAllUsers(currentUser.role)) {
        return NextResponse.json(
          { error: "Use access tags to change this user's access" },
          { status: 400 }
        )
      } else if (currentUser.role === UserRole.SERVANT_PREP) {
        // SERVANT_PREP can only set the roles it manages
        if (canServantPrepManageRole(role)) {
          updateData.role = role
        }
      }
    }

    // Password change: Only SUPER_ADMIN can change other users' passwords
    if (password) {
      if (currentUser.role !== UserRole.SUPER_ADMIN) {
        return NextResponse.json(
          { error: "Only Super Admins can change user passwords" },
          { status: 403 }
        )
      }
      updateData.password = await bcrypt.hash(password, 10)
      // Set mustChangePassword so the user is prompted to set their own password
      updateData.mustChangePassword = true
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        profileImageUrl: true,
        role: true,
        roleAssignments: {
          where: { revokedAt: null },
          select: { tag: true },
          orderBy: { grantedAt: 'asc' },
        },
        updatedAt: true,
      }
    })

    return NextResponse.json(user)
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update user" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}

// DELETE /api/users/[id] - Delete a user
// SUPER_ADMIN can delete anyone, SERVANT_PREP can only delete STUDENT and MENTOR users
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireAuth()
    const { id } = await params

    // Check if user can manage users
    if (!canManageUsers(currentUser.role)) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      )
    }

    // Prevent deleting yourself
    if (currentUser.id === id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      )
    }

    // Get the user being deleted
    const targetUser = await prisma.user.findUnique({ where: { id } })

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    // SERVANT_PREP can only delete Student, Mentor, and Sunday School Servant users
    if (currentUser.role === UserRole.SERVANT_PREP && !canServantPrepManageRole(targetUser.role)) {
      return NextResponse.json(
        { error: "Servants Prep can only delete Student, Mentor, and Sunday School Servant users" },
        { status: 403 }
      )
    }

    await prisma.$transaction(tx => deleteUserWithRelations(tx, id))

    await recordAuditEvent({
      actorUserId: currentUser.id,
      action: "user.delete",
      entityType: "User",
      entityId: id,
      result: AuditEventResult.SUCCESS,
      metadata: {
        targetName: targetUser.name,
        targetEmail: targetUser.email,
      },
    })

    return NextResponse.json({ message: "User deleted successfully" })
  } catch (error: unknown) {
    if (error instanceof UserDeletionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "This user still has related records and cannot be deleted. Disable the account instead, or remove the related assignments first." },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: (error instanceof Error && error.message === "Forbidden") ? 403 : 500 }
    )
  }
}
