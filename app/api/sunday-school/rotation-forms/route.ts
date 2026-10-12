import { NextResponse } from 'next/server'
import { Prisma, RoleTag } from '@prisma/client'
import { put, del } from '@vercel/blob'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, canWriteBusinessData, scopeIdWhere } from '@/lib/authorization'
import { prisma } from '@/lib/prisma'
import { handleApiError } from '@/lib/api-utils'
import { ROTATION_WEEKS, ROTATION_FORM_FILE_TYPES, ROTATION_FORM_MAX_BYTES, RotationWorkflowError, rotationCanSubmit, nextRotationLevel } from '@/lib/rotation-forms'

export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (context.disabled) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const manager = context.roleTags.has(RoleTag.SUPER_ADMIN) || context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT) || context.roleTags.has(RoleTag.PRIEST)
    const params = new URL(request.url).searchParams
    const assignmentId = params.get('assignmentId')
    const forms = await prisma.sundaySchoolRotationForm.findMany({
      where: {
        ...(assignmentId ? { assignmentId } : {}),
        ...(!manager ? { assignment: context.roleTags.has(RoleTag.SERVANTS_PREP_STUDENT) ? { studentId: user.id } : { student: scopeIdWhere(context.prepStudentScope) } } : {}),
      },
      include: {
        assignment: { select: { id: true, studentId: true, startDate: true, isActive: true, class: { select: { id: true, name: true, level: true } }, grade: true, student: { select: { id: true, name: true } } } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    })
    return NextResponse.json(forms, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return handleApiError(error) }
}

export async function POST(request: Request) {
  let newFileUrl: string | undefined
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (!canWriteBusinessData(context) || !context.roleTags.has(RoleTag.SERVANTS_PREP_STUDENT)) {
      return NextResponse.json({ error: 'Only active async students can upload rotation forms' }, { status: 403 })
    }
    const data = await request.formData()
    const assignmentId = data.get('assignmentId')
    const file = data.get('file')
    if (data.get('completedWeeks') !== '4') return NextResponse.json({ error: 'Confirm that all four weeks are completed and signed' }, { status: 400 })
    if (typeof assignmentId !== 'string' || !assignmentId || !file || typeof file === 'string') {
      return NextResponse.json({ error: 'Choose a rotation and a signed form' }, { status: 400 })
    }
    if (!ROTATION_FORM_FILE_TYPES.includes(file.type) || file.size === 0 || file.size > ROTATION_FORM_MAX_BYTES) {
      return NextResponse.json({ error: 'Upload a photo or PDF under 4.5 MB' }, { status: 400 })
    }
    const [assignment, enrollment] = await Promise.all([
      prisma.sundaySchoolAssignment.findFirst({ where: { id: assignmentId, studentId: user.id, isActive: true }, include: { rotationForm: true, class: { select: { level: true } } } }),
      prisma.studentEnrollment.findUnique({ where: { studentId: user.id }, select: { isActive: true, isAsyncStudent: true, status: true } }),
    ])
    if (!assignment || !enrollment?.isActive || !enrollment.isAsyncStudent || enrollment.status !== 'ACTIVE') return NextResponse.json({ error: 'Active async rotation not found' }, { status: 403 })
    if (assignment.totalWeeks !== ROTATION_WEEKS) return NextResponse.json({ error: 'Ask your Servants Prep servant to set this rotation to four weeks' }, { status: 409 })
    if (!assignment.class) return NextResponse.json({ error: 'Ask your Servants Prep servant to link your rotation to a class' }, { status: 409 })
    nextRotationLevel(assignment.class.level)
    if (!rotationCanSubmit(assignment.startDate)) return NextResponse.json({ error: 'Complete all four weeks before uploading your signed form' }, { status: 400 })
    if (assignment.rotationForm?.status === 'APPROVED') return NextResponse.json({ error: 'This rotation form is already approved' }, { status: 409 })

    const blob = await put(`rotation-forms/${assignment.id}/${crypto.randomUUID()}`, file, {
      access: 'public', contentType: file.type, addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    newFileUrl = blob.url
    const form = await prisma.$transaction(async tx => {
      const current = await tx.sundaySchoolAssignment.findFirst({ where: { id: assignment.id, studentId: user.id, isActive: true } })
      if (!current || current.totalWeeks !== ROTATION_WEEKS || current.startDate.getTime() !== assignment.startDate.getTime() || current.classId !== assignment.classId) throw new RotationWorkflowError('The rotation changed. Refresh before uploading')
      if (assignment.rotationForm) {
        const updated = await tx.sundaySchoolRotationForm.updateMany({
          where: { id: assignment.rotationForm.id, status: { not: 'APPROVED' }, version: assignment.rotationForm.version },
          data: { fileUrl: blob.url, filename: file.name, status: 'PENDING', version: { increment: 1 }, reviewNotes: null, reviewedById: null, reviewedAt: null },
        })
        if (updated.count !== 1) throw new RotationWorkflowError('The form changed. Refresh before uploading')
        return tx.sundaySchoolRotationForm.findUniqueOrThrow({ where: { id: assignment.rotationForm.id } })
      }
      return tx.sundaySchoolRotationForm.create({ data: { assignmentId: assignment.id, level: assignment.class!.level, fileUrl: blob.url, filename: file.name } })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    newFileUrl = undefined
    if (assignment.rotationForm) await del(assignment.rotationForm.fileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
    return NextResponse.json(form, { status: 201 })
  } catch (error) {
    if (newFileUrl) await del(newFileUrl, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {})
    if (error instanceof RotationWorkflowError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return NextResponse.json({ error: 'The rotation changed. Refresh and try again' }, { status: 409 })
    return handleApiError(error)
  }
}
