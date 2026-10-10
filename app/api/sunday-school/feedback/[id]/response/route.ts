import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getSundaySchoolAccess } from '@/lib/sunday-school-access'
import {
  canModerateFeedback,
  validateFeedbackTeamResponse,
} from '@/lib/sunday-school-feedback'
import { loadFeedbackIdeaForViewer } from '@/lib/sunday-school-feedback-server'
import {
  clearFeedbackTeamResponse,
  setFeedbackTeamResponse,
} from '@/lib/sunday-school-feedback-ops'

interface RouteContext {
  params: Promise<{ id: string }>
}

// One public reply per feedback item, always attributed to the Development Team.
// The author is retained for internal accountability but never serialized to viewers.
export async function PUT(request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!canModerateFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => null)
    const response = validateFeedbackTeamResponse(body?.response)
    if (!response) {
      return NextResponse.json(
        { error: 'Response must be between 1 and 2,000 characters' },
        { status: 400 }
      )
    }

    const existing = await prisma.sundaySchoolFeedbackIdea.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Feedback idea not found' }, { status: 404 })
    }

    await setFeedbackTeamResponse(id, response, user.id)
    return NextResponse.json(await loadFeedbackIdeaForViewer(id, user.id, access))
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireAuth()
    const access = await getSundaySchoolAccess(user)
    if (!canModerateFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.sundaySchoolFeedbackIdea.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Feedback idea not found' }, { status: 404 })
    }

    await clearFeedbackTeamResponse(id)
    return NextResponse.json(await loadFeedbackIdeaForViewer(id, user.id, access))
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
