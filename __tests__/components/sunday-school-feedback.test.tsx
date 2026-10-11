import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'
import type { SundaySchoolFeedbackResponse } from '@/types/sunday-school'

const mocks = vi.hoisted(() => ({
  useSundaySchoolFeedback: vi.fn(),
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated', session: { user: { id: 'viewer-1' } } }),
}))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolFeedback: mocks.useSundaySchoolFeedback,
}))
vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

import SundaySchoolFeedbackPage from '@/app/dashboard/servants/feedback/page'

function makeResponse(
  overrides: Partial<SundaySchoolFeedbackResponse> = {}
): SundaySchoolFeedbackResponse {
  return {
    ideas: [
      {
        id: 'idea-1',
        type: SundaySchoolFeedbackType.IDEA,
        title: 'Add lesson reminders',
        description: 'Send a reminder before class.',
        status: SundaySchoolFeedbackStatus.OPEN,
        teamResponse: null,
        teamRespondedAt: null,
        createdAt: '2026-09-01T12:00:00.000Z',
        updatedAt: '2026-09-01T12:00:00.000Z',
        submitter: { id: 'author-1', name: 'Sunday Servant', profileImageUrl: null },
        upvotes: 3,
        downvotes: 1,
        score: 2,
        viewerVote: null,
        canEdit: false,
        canDelete: false,
        canVote: true,
      },
    ],
    statusCounts: {
      OPEN: 1,
      PLANNED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      DECLINED: 0,
    },
    viewer: { canSubmit: true, canModerate: false },
    ...overrides,
  }
}

describe('Sunday School feedback page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
    mocks.useSundaySchoolFeedback.mockImplementation(() => ({
      data: makeResponse(),
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    }))
  })

  it('renders attributed feedback with a Reddit-style score and bug-report guidance', () => {
    render(<SundaySchoolFeedbackPage />)

    expect(screen.getByText('Add lesson reminders')).toBeInTheDocument()
    expect(screen.getByText('Idea')).toBeInTheDocument()
    expect(screen.getByText(/Sunday Servant ·/)).toBeInTheDocument()
    expect(screen.getByText(/report bugs/i)).toBeInTheDocument()
    expect(screen.getByText('3 upvotes and 1 downvotes')).toHaveClass('sr-only')
    expect(screen.getByLabelText('Net score 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Voting for Add lesson reminders')).toHaveClass(
      'flex-col'
    )
  })

  it('submits a new idea and refreshes the board', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'idea-2' }),
    }))
    render(<SundaySchoolFeedbackPage />)

    await user.click(screen.getByRole('button', { name: 'Post feedback' }))
    await user.click(screen.getByRole('radio', { name: /Problem/ }))
    await user.type(screen.getByLabelText('Title'), 'Add calendar export')
    await user.type(screen.getByLabelText('Details (optional)'), 'Let servants export sessions.')
    await user.click(screen.getByRole('button', { name: 'Submit feedback' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/sunday-school/feedback',
      expect.objectContaining({ method: 'POST' })
    ))
    const request = vi.mocked(fetch).mock.calls[0][1]
    expect(JSON.parse(String(request?.body))).toEqual(expect.objectContaining({
      type: SundaySchoolFeedbackType.PROBLEM,
    }))
    expect(mocks.mutate).toHaveBeenCalled()
  })

  it('uses distinct animated colors for an upvote and a downvote', () => {
    const upvoted = makeResponse()
    upvoted.ideas[0] = {
      ...upvoted.ideas[0],
      viewerVote: SundaySchoolFeedbackVoteType.UP,
    }
    mocks.useSundaySchoolFeedback.mockReturnValueOnce({
      data: upvoted,
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    })
    const { unmount } = render(<SundaySchoolFeedbackPage />)

    const upvote = screen.getByRole('button', { name: 'Upvote Add lesson reminders' })
    expect(upvote).toHaveAttribute('aria-pressed', 'true')
    expect(upvote).toHaveClass('text-orange-600')
    expect(upvote.querySelector('svg')).toHaveClass('feedback-vote-pop-up')
    unmount()

    const downvoted = makeResponse()
    downvoted.ideas[0] = {
      ...downvoted.ideas[0],
      viewerVote: SundaySchoolFeedbackVoteType.DOWN,
    }
    mocks.useSundaySchoolFeedback.mockReturnValueOnce({
      data: downvoted,
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    })
    render(<SundaySchoolFeedbackPage />)

    const downvote = screen.getByRole('button', { name: 'Downvote Add lesson reminders' })
    expect(downvote).toHaveAttribute('aria-pressed', 'true')
    expect(downvote).toHaveClass('text-blue-600')
    expect(downvote.querySelector('svg')).toHaveClass('feedback-vote-pop-down')
  })

  it('opens the author edit form with the existing content', async () => {
    const response = makeResponse()
    response.ideas[0] = { ...response.ideas[0], canEdit: true, canDelete: true, canVote: false }
    mocks.useSundaySchoolFeedback.mockReturnValue({
      data: response,
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    })
    const user = userEvent.setup()
    render(<SundaySchoolFeedbackPage />)

    await user.click(screen.getByRole('button', { name: 'Edit Add lesson reminders' }))

    expect(screen.getByLabelText('Title')).toHaveValue('Add lesson reminders')
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('Send a reminder before class.')
  })

  it('optimistically updates a vote and rolls back when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Vote failed' }),
    }))
    const response = makeResponse()
    render(<SundaySchoolFeedbackPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Upvote Add lesson reminders' }))

    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2))
    expect(mocks.mutate.mock.calls[0][0].ideas[0]).toEqual(
      expect.objectContaining({ upvotes: 4, score: 3, viewerVote: SundaySchoolFeedbackVoteType.UP })
    )
    expect(mocks.mutate.mock.calls[1][0]).toEqual(response)
    expect(mocks.toastError).toHaveBeenCalledWith('Vote failed')
  })

  it('loads the unfiltered top list and disables voting on resolved ideas', () => {
    const response = makeResponse()
    response.ideas[0] = {
      ...response.ideas[0],
      status: SundaySchoolFeedbackStatus.COMPLETED,
      canVote: false,
    }
    mocks.useSundaySchoolFeedback.mockImplementation(() => ({
      data: response,
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    }))
    render(<SundaySchoolFeedbackPage />)

    expect(screen.getByRole('button', { name: 'Upvote Add lesson reminders' })).toBeDisabled()
    expect(screen.getByText(/Voting closed/)).toBeInTheDocument()

    expect(mocks.useSundaySchoolFeedback).toHaveBeenCalledWith('ALL', 'TOP')
  })

  it('lets a moderator change status', async () => {
    mocks.useSundaySchoolFeedback.mockReturnValue({
      data: makeResponse({ viewer: { canSubmit: true, canModerate: true } }),
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'idea-1' }),
    }))
    render(<SundaySchoolFeedbackPage />)

    fireEvent.change(screen.getByLabelText('Change status for Add lesson reminders'), {
      target: { value: SundaySchoolFeedbackStatus.PLANNED },
    })

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/sunday-school/feedback/idea-1',
      expect.objectContaining({ method: 'PATCH' })
    ))
    expect(mocks.mutate).toHaveBeenCalled()
  })

  it('shows a reply as Development Team without revealing the admin and lets moderators edit it', async () => {
    const response = makeResponse({ viewer: { canSubmit: true, canModerate: true } })
    response.ideas[0] = {
      ...response.ideas[0],
      teamResponse: 'We are reviewing this request.',
      teamRespondedAt: '2026-09-02T12:00:00.000Z',
    }
    mocks.useSundaySchoolFeedback.mockReturnValue({
      data: response,
      error: null,
      isLoading: false,
      mutate: mocks.mutate,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'idea-1' }),
    }))
    const user = userEvent.setup()
    render(<SundaySchoolFeedbackPage />)

    expect(screen.getByText('Development Team')).toBeInTheDocument()
    expect(screen.getByText('We are reviewing this request.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit reply' }))
    expect(screen.getByLabelText('Response')).toHaveValue('We are reviewing this request.')
    await user.clear(screen.getByLabelText('Response'))
    await user.type(screen.getByLabelText('Response'), 'This is now planned.')
    await user.click(screen.getByRole('button', { name: 'Publish response' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/sunday-school/feedback/idea-1/response',
      expect.objectContaining({ method: 'PUT' })
    ))
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({
      response: 'This is now planned.',
    })
  })

  it('does not offer a reply action to non-moderators', () => {
    render(<SundaySchoolFeedbackPage />)
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument()
  })
})
