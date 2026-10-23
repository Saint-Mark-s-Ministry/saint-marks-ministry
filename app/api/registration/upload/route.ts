import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { prisma } from '@/lib/prisma'
import { isInviteCodeValid } from '@/lib/registration-utils'
import { blobUploadTarget } from '@/lib/blob-upload'

const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
]
const MAX_FILE_SIZE = 4.5 * 1024 * 1024 // 4.5 MB (Vercel's server upload limit)

/**
 * POST /api/registration/upload
 * Upload the registration profile image to Vercel Blob (public endpoint,
 * gated by invite code). Approval forms are uploaded after account creation.
 * Requires valid invite code in x-invite-code header
 */
export async function POST(req: NextRequest) {
  try {
    // Verify invite code from header
    const inviteCodeHeader = req.headers.get('x-invite-code')
    if (!inviteCodeHeader) {
      return NextResponse.json(
        { error: 'Missing invite code' },
        { status: 401 }
      )
    }

    // Check if registration is enabled
    const settings = await prisma.systemSettings.findUnique({
      where: { id: 'default' },
    })

    if (settings && !settings.registrationEnabled) {
      return NextResponse.json(
        { error: 'Registration is currently closed' },
        { status: 403 }
      )
    }

    // Validate invite code
    const inviteCode = await prisma.inviteCode.findUnique({
      where: { code: inviteCodeHeader.toUpperCase().trim() },
    })

    if (!inviteCode) {
      return NextResponse.json(
        { error: 'Invalid invite code' },
        { status: 401 }
      )
    }

    const validation = isInviteCodeValid(inviteCode)
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Invalid or expired invite code' },
        { status: 401 }
      )
    }

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES.join(', ')}`,
        },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`,
        },
        { status: 400 }
      )
    }

    // Upload to Vercel Blob
    const target = blobUploadTarget(`registrations/profile-images/${Date.now()}`, file)
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

    return NextResponse.json({
      url: blob.url,
      filename: file.name,
      size: file.size,
      contentType: file.type,
    })
  } catch (error: unknown) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
