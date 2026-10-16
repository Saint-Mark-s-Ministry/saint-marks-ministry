import { NextRequest, NextResponse } from 'next/server'
import { NotificationType, RegistrationStatus } from '@prisma/client'
import { put } from '@vercel/blob'
import { requireAuth } from '@/lib/auth-helpers'
import { getAnnualMentorRequirement } from '@/lib/annual-mentor-information'
import { prisma } from '@/lib/prisma'

const ALLOWED_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'application/pdf',
]
const MAX_FILE_SIZE = 4.5 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const [application, annualMentorRequirement] = await Promise.all([
      prisma.registrationSubmission.findFirst({
        where: { createdUserId: user.id, status: RegistrationStatus.APPROVED },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fatherOfConfessionName: true,
          mentorName: true,
          mentorPhone: true,
          mentorEmail: true,
        },
      }),
      getAnnualMentorRequirement(user.id),
    ])

    if (!application && !annualMentorRequirement) {
      return NextResponse.json({ error: 'Approved registration not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Please upload a PNG, JPG, GIF, or PDF file' }, { status: 400 })
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 4.5 MB limit' }, { status: 400 })
    }

    const blob = await put(`registrations/${application?.id ?? user.id}/${Date.now()}-${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })

    const complete = Boolean(
      (!application || application.fatherOfConfessionName) &&
      (!application || application.mentorName) &&
      (!application || application.mentorPhone) &&
      (!application || application.mentorEmail) &&
      (!annualMentorRequirement || annualMentorRequirement.information?.reviewedAt)
    )

    await prisma.$transaction(async (tx) => {
      if (application) {
        await tx.registrationSubmission.update({
          where: { id: application.id },
          data: { approvalFormUrl: blob.url, approvalFormFilename: file.name },
        })
      } else {
        await tx.studentEnrollment.update({
          where: { studentId: user.id },
          data: { approvalFormUrl: blob.url, approvalFormFilename: file.name },
        })
      }

      if (complete) {
        await tx.notification.deleteMany({
          where: {
            userId: user.id,
            type: NotificationType.REGISTRATION_INCOMPLETE,
            isPersistent: true,
          },
        })
      }
    })

    return NextResponse.json({ url: blob.url, filename: file.name, complete })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: message === 'Unauthorized' ? 401 : 500 }
    )
  }
}
