import { NextResponse } from 'next/server'
import { SundaySchoolFeedbackStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getSundaySchoolAccess } from '@/lib/sunday-school-access'
import {
  canDeleteFeedbackIdea,
  canEditFeedbackIdea,
  canModerateFeedback,
  canParticipateInFeedback,
  validateFeedbackContent,
} from '@/lib/sunday-school-feedback'
import {
  feedbackIdeaSelect,
  loadFeedbackIdeaForViewer,
} from '@/lib/sunday-school-feedback-server'
import { deleteFeedbackIdea, setFeedbackStatus } from '@/lib/sunday-school-feedback-ops'

interface RouteContext {
  params: Promise<{ id: string }>
}

// PATCH /api/sunday-school/feedback/[id]
// Authors may edit title/description while OPEN. SUPER_ADMIN may change status.
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!canParticipateInFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.sundaySchoolFeedbackIdea.findUnique({
      where: { id },
      select: { id: true, type: true, title: true, description: true, submittedById: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Feedback idea not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    const payload = body as Record<string, unknown>
    const contentRequested =
      payload.type !== undefined ||
      payload.title !== undefined ||
      payload.description !== undefined
    const statusRequested = payload.status !== undefined

    if (!contentRequested && !statusRequested) {
      return NextResponse.json({ error: 'No changes were provided' }, { status: 400 })
    }
    if (contentRequested && statusRequested) {
      return NextResponse.json(
        { error: 'Update idea content and status separately' },
        { status: 400 }
      )
    }

    if (contentRequested) {
      if (!canEditFeedbackIdea(access, user.id, existing.submittedById, existing.status)) {
        const status = existing.submittedById === user.id ? 409 : 403
        return NextResponse.json(
          { error: status === 409 ? 'Only open ideas can be edited' : 'Forbidden' },
          { status }
        )
      }

      const validation = validateFeedbackContent(
        payload.title ?? existing.title,
        payload.description === undefined ? existing.description : payload.description,
        payload.type ?? existing.type
      )
      if (!validation.value) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      await prisma.sundaySchoolFeedbackIdea.update({
        where: { id },
        data: validation.value,
        select: feedbackIdeaSelect,
      })
    } else {
      if (!canModerateFeedback(access)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (
        typeof payload.status !== 'string' ||
        !Object.values(SundaySchoolFeedbackStatus).includes(
          payload.status as SundaySchoolFeedbackStatus
        )
      ) {
        return NextResponse.json({ error: 'Invalid feedback status' }, { status: 400 })
      }

      await setFeedbackStatus(id, payload.status as SundaySchoolFeedbackStatus)
    }

    const updated = await loadFeedbackIdeaForViewer(id, user.id, access)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// DELETE /api/sunday-school/feedback/[id]
// The author may delete their OPEN idea; SUPER_ADMIN may delete any idea.
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!canParticipateInFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.sundaySchoolFeedbackIdea.findUnique({
      where: { id },
      select: { submittedById: true, status: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Feedback idea not found' }, { status: 404 })
    }

    if (!canDeleteFeedbackIdea(access, user.id, existing.submittedById, existing.status)) {
      const status = existing.submittedById === user.id ? 409 : 403
      return NextResponse.json(
        { error: status === 409 ? 'Only open ideas can be deleted' : 'Forbidden' },
        { status }
      )
    }

    await deleteFeedbackIdea(id)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
