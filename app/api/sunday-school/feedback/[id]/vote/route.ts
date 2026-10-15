import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getFeedbackAccess } from '@/lib/feedback-access'
import {
  canParticipateInFeedback,
  canVoteOnFeedbackIdea,
  isFeedbackVote,
} from '@/lib/sunday-school-feedback'
import { loadFeedbackIdeaForViewer } from '@/lib/sunday-school-feedback-server'

// PUT /api/sunday-school/feedback/[id]/vote
// Body: { vote: "UP" | "DOWN" | null }. The desired-state contract makes
// retries idempotent; the unique (ideaId, userId) key prevents duplicate votes.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth()
    const access = await getFeedbackAccess(user)
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
    if (!canVoteOnFeedbackIdea(access, user.id, existing.submittedById, existing.status)) {
      if (existing.submittedById === user.id) {
        return NextResponse.json({ error: 'You cannot vote on your own idea' }, { status: 403 })
      }
      return NextResponse.json({ error: 'Voting is closed for this idea' }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    const vote = body && typeof body === 'object'
      ? (body as Record<string, unknown>).vote
      : undefined
    if (vote !== null && !isFeedbackVote(vote)) {
      return NextResponse.json({ error: 'Vote must be UP, DOWN, or null' }, { status: 400 })
    }

    if (vote === null) {
      await prisma.sundaySchoolFeedbackVote.deleteMany({
        where: { ideaId: id, userId: user.id },
      })
    } else {
      await prisma.sundaySchoolFeedbackVote.upsert({
        where: { ideaId_userId: { ideaId: id, userId: user.id } },
        create: { ideaId: id, userId: user.id, vote },
        update: { vote },
      })
    }

    const updated = await loadFeedbackIdeaForViewer(id, user.id, access)
    return NextResponse.json(updated)
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
