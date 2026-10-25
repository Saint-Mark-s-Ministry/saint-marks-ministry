import { NextResponse } from 'next/server'
import { Prisma, RoleTag } from '@prisma/client'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, canWriteBusinessData } from '@/lib/authorization'
import { handleApiError } from '@/lib/api-utils'
import { prisma } from '@/lib/prisma'
import { approveAndAdvanceRotation } from '@/lib/rotation-form-service'
import { RotationWorkflowError, nextRotationStart } from '@/lib/rotation-forms'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const context = await getAuthorizationContext(user.id)
    if (!canWriteBusinessData(context) || !(context.roleTags.has(RoleTag.SUPER_ADMIN) || context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT) || context.roleTags.has(RoleTag.PRIEST))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    if (!['APPROVED', 'REJECTED'].includes(body.status)) return NextResponse.json({ error: 'Choose approve or reject' }, { status: 400 })
    if (!Number.isInteger(body.version) || body.version < 1) return NextResponse.json({ error: 'Refresh the form before reviewing it' }, { status: 400 })
    if (body.status === 'APPROVED' && body.confirmedWeeks !== 4) return NextResponse.json({ error: 'Verify all four signed weeks before approving' }, { status: 400 })
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) || null : null
    if (body.status === 'REJECTED' && !notes) return NextResponse.json({ error: 'Explain what the student needs to correct' }, { status: 400 })
    const review = () => prisma.$transaction(async tx => {
      if (body.status === 'REJECTED') {
        const changed = await tx.sundaySchoolRotationForm.updateMany({
          where: { id, status: 'PENDING', version: body.version, assignment: { isActive: true, studentId: { not: user.id } } },
          data: { status: 'REJECTED', version: { increment: 1 }, reviewNotes: notes, reviewedById: user.id, reviewedAt: new Date() },
        })
        if (changed.count !== 1) throw new RotationWorkflowError('This form is no longer pending. Refresh before reviewing it')
        return { status: 'REJECTED' }
      }
      const form = await tx.sundaySchoolRotationForm.findUnique({ where: { id }, select: { assignment: { select: { startDate: true } } } })
      if (!form) throw new RotationWorkflowError('Rotation form not found', 404)
      const nextAssignment = await approveAndAdvanceRotation(tx, {
        formId: id, reviewerId: user.id, expectedVersion: body.version,
        nextStartDate: nextRotationStart(form.assignment.startDate), reviewNotes: notes,
      })
      return { status: 'APPROVED', nextAssignment, rotationsComplete: nextAssignment === null }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    let result: Awaited<ReturnType<typeof review>> | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try { result = await review(); break } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)) throw error
      }
    }
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof RotationWorkflowError) return NextResponse.json({ error: error.message }, { status: error.status })
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return NextResponse.json({ error: 'The rotation changed. Refresh and try again' }, { status: 409 })
    return handleApiError(error)
  }
}
