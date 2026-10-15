import { NextResponse } from 'next/server'
import { SundaySchoolFeedbackStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { handleApiError } from '@/lib/api-utils'
import { getFeedbackAccess } from '@/lib/feedback-access'
import {
  ACTIVE_FEEDBACK_STATUSES,
  canModerateFeedback,
  canParticipateInFeedback,
  parseFeedbackSort,
  parseFeedbackStatusFilter,
  sortFeedbackIdeas,
  validateFeedbackContent,
} from '@/lib/sunday-school-feedback'
import {
  feedbackIdeaSelect,
  serializeFeedbackIdeas,
} from '@/lib/sunday-school-feedback-server'

// Shared product feedback for Sunday School participants and Servants Prep staff.
// Unlike ministry record writes, feedback participation is available to PRIEST.

// GET /api/sunday-school/feedback?status=ACTIVE|ALL|<status>&sort=TOP|NEWEST
export async function GET(request: Request) {
  try {
    const user = await requireAuth()
    const access = await getFeedbackAccess(user)
    if (!canParticipateInFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const statusFilter = parseFeedbackStatusFilter(searchParams.get('status'))
    const sort = parseFeedbackSort(searchParams.get('sort'))
    if (!statusFilter) {
      return NextResponse.json({ error: 'Invalid feedback status filter' }, { status: 400 })
    }
    if (!sort) {
      return NextResponse.json({ error: 'Invalid feedback sort' }, { status: 400 })
    }

    const where =
      statusFilter === 'ALL'
        ? {}
        : statusFilter === 'ACTIVE'
          ? { status: { in: ACTIVE_FEEDBACK_STATUSES } }
          : { status: statusFilter }

    const [ideas, countRows] = await Promise.all([
      prisma.sundaySchoolFeedbackIdea.findMany({
        where,
        select: feedbackIdeaSelect,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sundaySchoolFeedbackIdea.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ])

    const statusCounts = Object.fromEntries(
      Object.values(SundaySchoolFeedbackStatus).map(status => [status, 0])
    ) as Record<SundaySchoolFeedbackStatus, number>
    for (const row of countRows) statusCounts[row.status] = row._count._all

    const serialized = await serializeFeedbackIdeas(ideas, user.id, access)

    return NextResponse.json({
      ideas: sortFeedbackIdeas(serialized, sort),
      statusCounts,
      viewer: {
        canSubmit: true,
        canModerate: canModerateFeedback(access),
      },
    })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}

// POST /api/sunday-school/feedback
// Body: { title, description? }
export async function POST(request: Request) {
  try {
    const user = await requireAuth()
    const access = await getFeedbackAccess(user)
    if (!canParticipateInFeedback(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const validation = validateFeedbackContent(
      (body as Record<string, unknown>).title,
      (body as Record<string, unknown>).description,
      (body as Record<string, unknown>).type
    )
    if (!validation.value) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    const idea = await prisma.sundaySchoolFeedbackIdea.create({
      data: {
        ...validation.value,
        status: SundaySchoolFeedbackStatus.OPEN,
        submittedById: user.id,
      },
      select: feedbackIdeaSelect,
    })
    const [serialized] = await serializeFeedbackIdeas([idea], user.id, access)

    return NextResponse.json(serialized, { status: 201 })
  } catch (error: unknown) {
    return handleApiError(error)
  }
}
