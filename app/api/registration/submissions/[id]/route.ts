import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewRegistrations, canReviewRegistrations } from '@/lib/roles'
import { del } from '@vercel/blob'
import { withRegistrationNameMatches } from '@/lib/registration-name-matches'

/**
 * GET /api/registration/submissions/[id]
 * Get a single registration submission detail
 * Auth: SUPER_ADMIN, SERVANT_PREP, PRIEST
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canViewRegistrations(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    const submission = await prisma.registrationSubmission.findUnique({
      where: { id },
      include: {
        inviteCode: {
          select: {
            code: true,
            label: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        createdUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    })

    if (!submission) {
      return NextResponse.json(
        { error: 'Registration submission not found' },
        { status: 404 }
      )
    }

    const [detail] = await withRegistrationNameMatches([submission])
    return NextResponse.json(detail)
  } catch (error: unknown) {
    console.error('Error fetching registration submission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/registration/submissions/[id]
 * Delete a registration submission (and its uploaded file)
 * Auth: SUPER_ADMIN, SERVANT_PREP
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!canReviewRegistrations(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params

    // Get submission to check if it has an uploaded file
    const submission = await prisma.registrationSubmission.findUnique({
      where: { id },
    })

    if (!submission) {
      return NextResponse.json(
        { error: 'Registration submission not found' },
        { status: 404 }
      )
    }

    // Delete uploaded files from Vercel Blob
    try {
      if (submission.approvalFormUrl) {
        await del(submission.approvalFormUrl)
      }
      if (submission.profileImageUrl) {
        await del(submission.profileImageUrl)
      }
    } catch (blobError) {
      console.error('Error deleting blob file:', blobError)
      // Continue with submission deletion even if blob deletion fails
    }

    // Delete the submission
    await prisma.registrationSubmission.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting registration submission:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
