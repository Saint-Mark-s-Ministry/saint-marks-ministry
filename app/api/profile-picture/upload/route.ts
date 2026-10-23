import { NextRequest, NextResponse } from 'next/server'
import { put, del } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { canManageUsers, canServantPrepManageRole } from '@/lib/roles'
import { UserRole } from '@prisma/client'
import { blobUploadTarget } from '@/lib/blob-upload'

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]
const MAX_FILE_SIZE = 4.5 * 1024 * 1024 // 4.5 MB

/**
 * POST /api/profile-picture/upload
 * Upload a profile picture for the current user or another user (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const currentUser = await requireAuth()

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const targetUserId = (formData.get('userId') as string) || currentUser.id

    // If uploading for another user, require admin permissions
    if (targetUserId !== currentUser.id) {
      if (!canManageUsers(currentUser.role)) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        )
      }

      // SERVANT_PREP can only manage the roles it is allowed to manage
      if (currentUser.role === UserRole.SERVANT_PREP) {
        const targetUser = await prisma.user.findUnique({
          where: { id: targetUserId },
          select: { role: true },
        })
        if (targetUser && !canServantPrepManageRole(targetUser.role)) {
          return NextResponse.json(
            { error: 'Servants Prep can only manage Student, Mentor, and Sunday School Servant users' },
            { status: 403 }
          )
        }
      }
    }

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type (images only, no PDF)
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PNG, JPG, or GIF' },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds 4.5 MB limit' },
        { status: 400 }
      )
    }

    // Delete old profile image if exists
    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { profileImageUrl: true },
    })

    if (existingUser?.profileImageUrl) {
      try {
        await del(existingUser.profileImageUrl, {
          token: process.env.BLOB_READ_WRITE_TOKEN,
        })
      } catch (blobError) {
        console.error('Error deleting old profile image:', blobError)
        // Continue even if old blob deletion fails
      }
    }

    // Upload to Vercel Blob
    const target = blobUploadTarget(`profile-pictures/${targetUserId}-${Date.now()}`, file)
    const blob = await put(
      target.pathname,
      file,
      {
        access: 'public',
        contentType: target.contentType,
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }
    )

    // Update user's profileImageUrl
    await prisma.user.update({
      where: { id: targetUserId },
      data: { profileImageUrl: blob.url },
    })

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
    })
  } catch (error: unknown) {
    console.error('Error uploading profile picture:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
