import { NextResponse } from 'next/server'
import { NotificationType, RegistrationStatus, type Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { head, put } from '@vercel/blob'
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client'
import { getAnnualMentorRequirement } from '@/lib/annual-mentor-information'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { isMentorFormConflict } from '@/lib/mentor-form-error'
import {
  APPROVAL_FORM_CONTENT_TYPE, APPROVAL_FORM_MAX_BYTES, approvalFormFileError,
  approvalFormPrefix, approvalFormStorageName, isOwnApprovalFormPath,
} from '@/lib/approval-form-upload'

export async function handleApprovalFormUpload(request: Request, studentId: string, staffTransaction?: (tx: Prisma.TransactionClient, source: { applicationId: string | null; academicYearId: string | null; annualVersion: string | null }) => Promise<void>) {
  try {
    const [application, annualMentorRequirement] = await Promise.all([
      prisma.registrationSubmission.findFirst({
        where: { createdUserId: studentId, status: RegistrationStatus.APPROVED },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          fatherOfConfessionName: true,
          mentorName: true,
          mentorPhone: true,
          mentorEmail: true,
        },
      }),
      getAnnualMentorRequirement(studentId),
    ])

    if (!application && !annualMentorRequirement) {
      return NextResponse.json({ error: 'Approved registration not found' }, { status: 404 })
    }

    let uploaded: { url: string; filename: string }
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body: unknown = await request.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json({ error: 'Invalid upload request' }, { status: 400 })
      }
      const data = body as Record<string, unknown>
      if (typeof data.filename !== 'string' || !data.filename.trim() || data.filename.length > 255) {
        return NextResponse.json({ error: 'Please choose a file with a valid filename' }, { status: 400 })
      }
      const filename = data.filename
      if (data.action === 'prepare') {
        if (typeof data.size !== 'number' || !Number.isSafeInteger(data.size) || data.size < 0) {
          return NextResponse.json({ error: 'Invalid file size' }, { status: 400 })
        }
        const fileError = approvalFormFileError({ size: data.size })
        if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })
        const pathname = `${approvalFormPrefix(studentId)}${randomUUID()}/${approvalFormStorageName(filename)}`
        const clientToken = await generateClientTokenFromReadWriteToken({
          pathname,
          allowedContentTypes: [APPROVAL_FORM_CONTENT_TYPE],
          maximumSizeInBytes: APPROVAL_FORM_MAX_BYTES,
          validUntil: Date.now() + 30 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          token: process.env.BLOB_READ_WRITE_TOKEN,
        })
        return NextResponse.json({ pathname, clientToken })
      }
      if (data.action !== 'complete' || typeof data.pathname !== 'string' ||
        !isOwnApprovalFormPath(data.pathname, studentId) ||
        !data.pathname.endsWith(`/${approvalFormStorageName(filename)}`)) {
        return NextResponse.json({ error: 'Invalid upload reference' }, { status: 400 })
      }
      // Resolve by pathname within our own store; never trust a browser-supplied
      // URL, size, content type or another student's upload reference.
      const blob = await head(data.pathname, { token: process.env.BLOB_READ_WRITE_TOKEN })
      if (blob.pathname !== data.pathname || blob.contentType !== APPROVAL_FORM_CONTENT_TYPE ||
        approvalFormFileError(blob)) {
        return NextResponse.json({ error: 'Unable to verify this uploaded file. Please upload it again.' }, { status: 400 })
      }
      uploaded = { url: blob.downloadUrl, filename }
    } else {
      // Compatibility for pages already open when this update deploys. New
      // pages send the file directly to Blob, with only small JSON API calls.
      const formData = await request.formData()
      const file = formData.get('file')
      if (!file || typeof file === 'string') return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      const fileError = approvalFormFileError(file)
      if (fileError) return NextResponse.json({ error: fileError }, { status: 400 })
      if (file.size > 4 * 1024 * 1024) {
        return NextResponse.json({ error: 'Refresh the page, then choose this file again to use the updated uploader.' }, { status: 413 })
      }
      const pathname = `${approvalFormPrefix(studentId)}${randomUUID()}/${approvalFormStorageName(file.name)}`
      const blob = await put(pathname, file, {
        access: 'public',
        contentType: APPROVAL_FORM_CONTENT_TYPE,
        addRandomSuffix: false,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
      uploaded = { url: blob.downloadUrl, filename: file.name }
    }

    const complete = Boolean(
      (!application || application.fatherOfConfessionName) &&
      (!application || application.mentorName) &&
      (!application || application.mentorPhone) &&
      (!application || application.mentorEmail) &&
      (!annualMentorRequirement || (!staffTransaction && annualMentorRequirement.information?.reviewedAt))
    )

    await prisma.$transaction(async (tx) => {
      if (staffTransaction) await staffTransaction(tx, { applicationId: application?.id ?? null, academicYearId: annualMentorRequirement?.activeYear.id ?? null, annualVersion: annualMentorRequirement?.information?.updatedAt.toISOString() ?? null })
      if (application) {
        await tx.registrationSubmission.update({
          where: { id: application.id },
          data: { approvalFormUrl: uploaded.url, approvalFormFilename: uploaded.filename },
        })
      } else {
        await tx.studentEnrollment.update({
          where: { studentId },
          data: { approvalFormUrl: uploaded.url, approvalFormFilename: uploaded.filename },
        })
      }

      if (complete) {
        await tx.notification.deleteMany({
          where: {
            userId: studentId,
            type: NotificationType.REGISTRATION_INCOMPLETE,
            isPersistent: true,
          },
        })
      }
    })

    return NextResponse.json({ ...uploaded, complete })
  } catch (error: unknown) {
    if (isMentorFormConflict(error)) return NextResponse.json({ error: 'Mentor form changed. Refresh the form before uploading again.' }, { status: 409 })
    return handleApiError(error)
  }
}
