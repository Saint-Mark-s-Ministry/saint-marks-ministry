import { describe, expect, it } from 'vitest'
import {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'
import type { SundaySchoolAccess } from '@/lib/sunday-school-access'
import {
  canDeleteFeedbackIdea,
  canEditFeedbackIdea,
  canModerateFeedback,
  canParticipateInFeedback,
  canVoteOnFeedbackIdea,
  isFeedbackVote,
  parseFeedbackSort,
  parseFeedbackStatusFilter,
  sortFeedbackIdeas,
  validateFeedbackContent,
} from '@/lib/sunday-school-feedback'

function makeAccess(overrides: Partial<SundaySchoolAccess> = {}): SundaySchoolAccess {
  return {
    isAdmin: false,
    readOnly: false,
    canRead: true,
    servantClassIds: new Set(),
    coordinatorClassIds: new Set(),
    coordinatorAgeGroupIds: new Set(),
    coordinatorLevels: new Set(),
    visibleClassIds: new Set(),
    ...overrides,
  }
}

const servant = makeAccess()
const coordinator = makeAccess({ coordinatorClassIds: new Set(['class-a']) })
const priest = makeAccess({ readOnly: true, visibleClassIds: 'all' })
const superAdmin = makeAccess({ isAdmin: true, visibleClassIds: 'all' })
const unassignedUser = makeAccess({ canRead: false })

describe('Sunday School feedback permissions', () => {
  it('allows every Sunday School participant, including PRIEST, to use feedback', () => {
    expect(canParticipateInFeedback(servant)).toBe(true)
    expect(canParticipateInFeedback(coordinator)).toBe(true)
    expect(canParticipateInFeedback(priest)).toBe(true)
    expect(canParticipateInFeedback(superAdmin)).toBe(true)
    expect(canParticipateInFeedback(unassignedUser)).toBe(false)
  })

  it('reserves moderation for SUPER_ADMIN', () => {
    expect(canModerateFeedback(superAdmin)).toBe(true)
    expect(canModerateFeedback(priest)).toBe(false)
    expect(canModerateFeedback(coordinator)).toBe(false)
  })

  it('lets an author edit and delete only their own open idea', () => {
    expect(canEditFeedbackIdea(servant, 'author', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(true)
    expect(canDeleteFeedbackIdea(servant, 'author', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(true)
    expect(canEditFeedbackIdea(servant, 'other', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(false)
    expect(canDeleteFeedbackIdea(servant, 'author', 'author', SundaySchoolFeedbackStatus.PLANNED)).toBe(false)
  })

  it('lets SUPER_ADMIN delete any status but not rewrite another author\'s content', () => {
    expect(canDeleteFeedbackIdea(superAdmin, 'admin', 'author', SundaySchoolFeedbackStatus.COMPLETED)).toBe(true)
    expect(canEditFeedbackIdea(superAdmin, 'admin', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(false)
  })

  it('allows priest votes while rejecting self-votes and resolved ideas', () => {
    expect(canVoteOnFeedbackIdea(priest, 'priest', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(true)
    expect(canVoteOnFeedbackIdea(servant, 'author', 'author', SundaySchoolFeedbackStatus.OPEN)).toBe(false)
    expect(canVoteOnFeedbackIdea(servant, 'voter', 'author', SundaySchoolFeedbackStatus.COMPLETED)).toBe(false)
    expect(canVoteOnFeedbackIdea(servant, 'voter', 'author', SundaySchoolFeedbackStatus.DECLINED)).toBe(false)
  })
})

describe('Sunday School feedback validation and sorting', () => {
  it('trims valid content and normalizes an empty description', () => {
    expect(validateFeedbackContent('  Better reports  ', '   ')).toEqual({
      value: {
        type: SundaySchoolFeedbackType.IDEA,
        title: 'Better reports',
        description: null,
      },
    })
  })

  it('accepts problems and rejects an unknown feedback type', () => {
    expect(validateFeedbackContent(
      'Attendance is broken',
      'The save button fails.',
      SundaySchoolFeedbackType.PROBLEM
    )).toEqual({
      value: {
        type: SundaySchoolFeedbackType.PROBLEM,
        title: 'Attendance is broken',
        description: 'The save button fails.',
      },
    })
    expect(validateFeedbackContent('Valid title', '', 'QUESTION')).toEqual({
      error: 'Select whether this feedback is a problem or an idea',
    })
  })

  it('enforces title and description length limits', () => {
    expect(validateFeedbackContent('ab', '')).toEqual({ error: 'Title must be at least 3 characters' })
    expect(validateFeedbackContent('x'.repeat(121), '')).toEqual({
      error: 'Title must be 120 characters or fewer',
    })
    expect(validateFeedbackContent('Valid title', 'x'.repeat(2001))).toEqual({
      error: 'Description must be 2000 characters or fewer',
    })
  })

  it('parses supported filters, sorts, and vote values', () => {
    expect(parseFeedbackStatusFilter(null)).toBe('ACTIVE')
    expect(parseFeedbackStatusFilter('completed')).toBe(SundaySchoolFeedbackStatus.COMPLETED)
    expect(parseFeedbackStatusFilter('unknown')).toBeNull()
    expect(parseFeedbackSort(null)).toBe('TOP')
    expect(parseFeedbackSort('newest')).toBe('NEWEST')
    expect(parseFeedbackSort('popular')).toBeNull()
    expect(isFeedbackVote(SundaySchoolFeedbackVoteType.UP)).toBe(true)
    expect(isFeedbackVote(null)).toBe(false)
  })

  it('sorts top ideas by upvotes, then fewer downvotes, then newest', () => {
    const ideas = [
      { id: 'older-high-up', status: SundaySchoolFeedbackStatus.OPEN, upvotes: 5, downvotes: 2, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'newer-low-up', status: SundaySchoolFeedbackStatus.OPEN, upvotes: 4, downvotes: 1, createdAt: '2026-02-01T00:00:00.000Z' },
      { id: 'highest-score', status: SundaySchoolFeedbackStatus.OPEN, upvotes: 4, downvotes: 0, createdAt: '2025-12-01T00:00:00.000Z' },
    ]

    expect(sortFeedbackIdeas(ideas, 'TOP').map(idea => idea.id)).toEqual([
      'older-high-up',
      'highest-score',
      'newer-low-up',
    ])
    expect(sortFeedbackIdeas(ideas, 'NEWEST').map(idea => idea.id)).toEqual([
      'newer-low-up',
      'older-high-up',
      'highest-score',
    ])
  })

  it('keeps open ideas ahead of resolved ones in both sorts', () => {
    const ideas = [
      { id: 'completed', status: SundaySchoolFeedbackStatus.COMPLETED, upvotes: 20, downvotes: 0, createdAt: '2026-09-03T00:00:00.000Z' },
      { id: 'planned', status: SundaySchoolFeedbackStatus.PLANNED, upvotes: 4, downvotes: 0, createdAt: '2026-09-02T00:00:00.000Z' },
      { id: 'open', status: SundaySchoolFeedbackStatus.OPEN, upvotes: 1, downvotes: 0, createdAt: '2026-09-01T00:00:00.000Z' },
    ]

    expect(sortFeedbackIdeas(ideas, 'TOP').map(idea => idea.id)).toEqual(['open', 'planned', 'completed'])
    expect(sortFeedbackIdeas(ideas, 'NEWEST').map(idea => idea.id)).toEqual(['open', 'planned', 'completed'])
  })
})
