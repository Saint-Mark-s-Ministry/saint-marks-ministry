import type {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { SundaySchoolAccess } from '@/lib/sunday-school-access'
import {
  canDeleteFeedbackIdea,
  canEditFeedbackIdea,
  canVoteOnFeedbackIdea,
} from '@/lib/sunday-school-feedback'
import type { SundaySchoolFeedbackIdea } from '@/types/sunday-school'

export const feedbackIdeaSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
  status: true,
  teamResponse: true,
  teamRespondedAt: true,
  submittedById: true,
  createdAt: true,
  updatedAt: true,
  submitter: {
    select: { id: true, name: true, profileImageUrl: true },
  },
} as const

export interface FeedbackIdeaRecord {
  id: string
  type: SundaySchoolFeedbackType
  title: string
  description: string | null
  status: SundaySchoolFeedbackStatus
  teamResponse: string | null
  teamRespondedAt: Date | null
  submittedById: string | null
  createdAt: Date
  updatedAt: Date
  submitter: {
    id: string
    name: string
    profileImageUrl: string | null
  } | null
}

export async function serializeFeedbackIdeas(
  ideas: FeedbackIdeaRecord[],
  viewerId: string,
  access: SundaySchoolAccess
): Promise<SundaySchoolFeedbackIdea[]> {
  if (ideas.length === 0) return []

  const ideaIds = ideas.map(idea => idea.id)
  const [voteCounts, viewerVotes] = await Promise.all([
    prisma.sundaySchoolFeedbackVote.groupBy({
      by: ['ideaId', 'vote'],
      where: { ideaId: { in: ideaIds } },
      _count: { _all: true },
    }),
    prisma.sundaySchoolFeedbackVote.findMany({
      where: { ideaId: { in: ideaIds }, userId: viewerId },
      select: { ideaId: true, vote: true },
    }),
  ])

  const counts = new Map<string, { upvotes: number; downvotes: number }>()
  for (const row of voteCounts) {
    const current = counts.get(row.ideaId) ?? { upvotes: 0, downvotes: 0 }
    if (row.vote === 'UP') current.upvotes = row._count._all
    if (row.vote === 'DOWN') current.downvotes = row._count._all
    counts.set(row.ideaId, current)
  }

  const viewerVoteByIdea = new Map<string, SundaySchoolFeedbackVoteType>(
    viewerVotes.map(vote => [vote.ideaId, vote.vote])
  )

  return ideas.map(idea => {
    const ideaCounts = counts.get(idea.id) ?? { upvotes: 0, downvotes: 0 }
    return {
      id: idea.id,
      type: idea.type,
      title: idea.title,
      description: idea.description,
      status: idea.status,
      teamResponse: idea.teamResponse,
      teamRespondedAt: idea.teamRespondedAt?.toISOString() ?? null,
      createdAt: idea.createdAt.toISOString(),
      updatedAt: idea.updatedAt.toISOString(),
      submitter: idea.submitter,
      upvotes: ideaCounts.upvotes,
      downvotes: ideaCounts.downvotes,
      score: ideaCounts.upvotes - ideaCounts.downvotes,
      viewerVote: viewerVoteByIdea.get(idea.id) ?? null,
      canEdit: canEditFeedbackIdea(
        access,
        viewerId,
        idea.submittedById,
        idea.status
      ),
      canDelete: canDeleteFeedbackIdea(
        access,
        viewerId,
        idea.submittedById,
        idea.status
      ),
      canVote: canVoteOnFeedbackIdea(
        access,
        viewerId,
        idea.submittedById,
        idea.status
      ),
    }
  })
}

export async function loadFeedbackIdeaForViewer(
  ideaId: string,
  viewerId: string,
  access: SundaySchoolAccess
): Promise<SundaySchoolFeedbackIdea | null> {
  const idea = await prisma.sundaySchoolFeedbackIdea.findUnique({
    where: { id: ideaId },
    select: feedbackIdeaSelect,
  })
  if (!idea) return null
  return (await serializeFeedbackIdeas([idea], viewerId, access))[0]
}
