import {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'
import type { SundaySchoolAccess } from '@/lib/sunday-school-access'

export const ACTIVE_FEEDBACK_STATUSES: SundaySchoolFeedbackStatus[] = [
  SundaySchoolFeedbackStatus.OPEN,
  SundaySchoolFeedbackStatus.PLANNED,
  SundaySchoolFeedbackStatus.IN_PROGRESS,
]

export const FEEDBACK_TITLE_MIN_LENGTH = 3
export const FEEDBACK_TITLE_MAX_LENGTH = 120
export const FEEDBACK_DESCRIPTION_MAX_LENGTH = 2000
export const FEEDBACK_TEAM_RESPONSE_MAX_LENGTH = 2000

export function validateFeedbackTeamResponse(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const response = value.trim()
  return response.length > 0 && response.length <= FEEDBACK_TEAM_RESPONSE_MAX_LENGTH
    ? response
    : null
}

export type FeedbackStatusFilter = SundaySchoolFeedbackStatus | 'ACTIVE' | 'ALL'
export type FeedbackSort = 'TOP' | 'NEWEST'

export interface FeedbackContent {
  type: SundaySchoolFeedbackType
  title: string
  description: string | null
}

export interface FeedbackValidationResult {
  value?: FeedbackContent
  error?: string
}

export function validateFeedbackContent(
  title: unknown,
  description: unknown,
  type: unknown = SundaySchoolFeedbackType.IDEA
): FeedbackValidationResult {
  if (
    typeof type !== 'string' ||
    !Object.values(SundaySchoolFeedbackType).includes(type as SundaySchoolFeedbackType)
  ) {
    return { error: 'Select whether this feedback is a problem or an idea' }
  }

  if (typeof title !== 'string') {
    return { error: 'Title is required' }
  }

  const trimmedTitle = title.trim()
  if (trimmedTitle.length < FEEDBACK_TITLE_MIN_LENGTH) {
    return { error: `Title must be at least ${FEEDBACK_TITLE_MIN_LENGTH} characters` }
  }
  if (trimmedTitle.length > FEEDBACK_TITLE_MAX_LENGTH) {
    return { error: `Title must be ${FEEDBACK_TITLE_MAX_LENGTH} characters or fewer` }
  }

  if (description !== undefined && description !== null && typeof description !== 'string') {
    return { error: 'Description must be text' }
  }

  const trimmedDescription = typeof description === 'string' ? description.trim() : ''
  if (trimmedDescription.length > FEEDBACK_DESCRIPTION_MAX_LENGTH) {
    return {
      error: `Description must be ${FEEDBACK_DESCRIPTION_MAX_LENGTH} characters or fewer`,
    }
  }

  return {
    value: {
      type: type as SundaySchoolFeedbackType,
      title: trimmedTitle,
      description: trimmedDescription || null,
    },
  }
}

export function parseFeedbackStatusFilter(value: string | null): FeedbackStatusFilter | null {
  const normalized = (value ?? 'ACTIVE').toUpperCase()
  if (normalized === 'ACTIVE' || normalized === 'ALL') return normalized
  if (Object.values(SundaySchoolFeedbackStatus).includes(normalized as SundaySchoolFeedbackStatus)) {
    return normalized as SundaySchoolFeedbackStatus
  }
  return null
}

export function parseFeedbackSort(value: string | null): FeedbackSort | null {
  const normalized = (value ?? 'TOP').toUpperCase()
  return normalized === 'TOP' || normalized === 'NEWEST' ? normalized : null
}

export function isFeedbackVote(value: unknown): value is SundaySchoolFeedbackVoteType {
  return Object.values(SundaySchoolFeedbackVoteType).includes(
    value as SundaySchoolFeedbackVoteType
  )
}

// Feedback is a deliberate exception to the normal PRIEST read-only rule:
// anyone who can enter Sunday School may participate in this product forum.
export function canParticipateInFeedback(access: SundaySchoolAccess): boolean {
  return access.canRead
}

export function canModerateFeedback(access: SundaySchoolAccess): boolean {
  return access.isAdmin
}

export function canEditFeedbackIdea(
  access: SundaySchoolAccess,
  viewerId: string,
  submittedById: string | null,
  status: SundaySchoolFeedbackStatus
): boolean {
  return (
    canParticipateInFeedback(access) &&
    submittedById === viewerId &&
    status === SundaySchoolFeedbackStatus.OPEN
  )
}

export function canDeleteFeedbackIdea(
  access: SundaySchoolAccess,
  viewerId: string,
  submittedById: string | null,
  status: SundaySchoolFeedbackStatus
): boolean {
  return (
    canModerateFeedback(access) ||
    canEditFeedbackIdea(access, viewerId, submittedById, status)
  )
}

export function canVoteOnFeedbackIdea(
  access: SundaySchoolAccess,
  viewerId: string,
  submittedById: string | null,
  status: SundaySchoolFeedbackStatus
): boolean {
  return (
    canParticipateInFeedback(access) &&
    submittedById !== viewerId &&
    ACTIVE_FEEDBACK_STATUSES.includes(status)
  )
}

export interface RankableFeedbackIdea {
  status: SundaySchoolFeedbackStatus
  createdAt: Date | string
  upvotes: number
  downvotes: number
}

const FEEDBACK_STATUS_SORT_ORDER: Record<SundaySchoolFeedbackStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  PLANNED: 1,
  DECLINED: 2,
  COMPLETED: 3,
}

export function sortFeedbackIdeas<T extends RankableFeedbackIdea>(
  ideas: T[],
  sort: FeedbackSort
): T[] {
  return [...ideas].sort((a, b) => {
    const statusDifference =
      FEEDBACK_STATUS_SORT_ORDER[a.status] - FEEDBACK_STATUS_SORT_ORDER[b.status]
    if (statusDifference !== 0) return statusDifference

    const createdDifference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    if (sort === 'NEWEST') return createdDifference

    if (b.upvotes !== a.upvotes) return b.upvotes - a.upvotes
    if (a.downvotes !== b.downvotes) return a.downvotes - b.downvotes
    return createdDifference
  })
}
