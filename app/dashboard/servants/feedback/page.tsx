'use client'

import { useState, type FormEvent } from 'react'
import {
  SundaySchoolFeedbackStatus,
  SundaySchoolFeedbackType,
  SundaySchoolFeedbackVoteType,
} from '@prisma/client'
import {
  ArrowBigDown,
  ArrowBigUp,
  Bug,
  Lightbulb,
  MessageSquareReply,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/admin/page-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { Textarea } from '@/components/ui/textarea'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import {
  FEEDBACK_DESCRIPTION_MAX_LENGTH,
  FEEDBACK_TEAM_RESPONSE_MAX_LENGTH,
  FEEDBACK_TITLE_MAX_LENGTH,
} from '@/lib/sunday-school-feedback'
import { useSundaySchoolFeedback } from '@/lib/swr'
import { cn } from '@/lib/utils'
import type {
  SundaySchoolFeedbackIdea,
  SundaySchoolFeedbackResponse,
} from '@/types/sunday-school'

const STATUS_LABELS: Record<SundaySchoolFeedbackStatus, string> = {
  OPEN: 'Open',
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DECLINED: 'Declined',
}

const STATUS_STYLES: Record<SundaySchoolFeedbackStatus, string> = {
  OPEN: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200',
  PLANNED: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200',
  IN_PROGRESS: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  DECLINED: 'border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

const TYPE_LABELS: Record<SundaySchoolFeedbackType, string> = {
  PROBLEM: 'Problem',
  IDEA: 'Idea',
}

const TYPE_STYLES: Record<SundaySchoolFeedbackType, string> = {
  PROBLEM: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200',
  IDEA: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
}

function formatSubmittedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function optimisticVote(
  response: SundaySchoolFeedbackResponse,
  ideaId: string,
  nextVote: SundaySchoolFeedbackVoteType | null
): SundaySchoolFeedbackResponse {
  return {
    ...response,
    ideas: response.ideas.map(idea => {
      if (idea.id !== ideaId) return idea

      let upvotes = idea.upvotes
      let downvotes = idea.downvotes
      if (idea.viewerVote === SundaySchoolFeedbackVoteType.UP) upvotes--
      if (idea.viewerVote === SundaySchoolFeedbackVoteType.DOWN) downvotes--
      if (nextVote === SundaySchoolFeedbackVoteType.UP) upvotes++
      if (nextVote === SundaySchoolFeedbackVoteType.DOWN) downvotes++

      return {
        ...idea,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        viewerVote: nextVote,
      }
    }),
  }
}

interface FeedbackVoteRailProps {
  idea: SundaySchoolFeedbackIdea
  disabled: boolean
  onVote: (vote: SundaySchoolFeedbackVoteType) => void
}

function FeedbackVoteRail({ idea, disabled, onVote }: FeedbackVoteRailProps) {
  const hasUpvote = idea.viewerVote === SundaySchoolFeedbackVoteType.UP
  const hasDownvote = idea.viewerVote === SundaySchoolFeedbackVoteType.DOWN

  return (
    <div
      className="flex h-fit w-fit shrink-0 flex-row items-center rounded-full border border-gray-200 bg-gray-50 p-1 shadow-sm sm:flex-col dark:border-gray-700 dark:bg-gray-900"
      aria-label={`Voting for ${idea.title}`}
    >
      <button
        type="button"
        aria-label={`Upvote ${idea.title}`}
        aria-pressed={hasUpvote}
        title={hasUpvote ? 'Remove upvote' : 'Upvote'}
        disabled={disabled}
        onClick={() => onVote(SundaySchoolFeedbackVoteType.UP)}
        className={cn(
          'group flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-gray-950',
          hasUpvote
            ? 'bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400'
            : 'text-gray-500 hover:bg-orange-100 hover:text-orange-600 dark:text-gray-400 dark:hover:bg-orange-950/60 dark:hover:text-orange-400'
        )}
      >
        <ArrowBigUp
          className={cn(
            'h-6 w-6 transition-transform group-active:-translate-y-0.5 group-active:scale-90',
            hasUpvote && 'feedback-vote-pop-up fill-current'
          )}
        />
      </button>

      <span
        key={`${idea.score}-${idea.viewerVote ?? 'none'}`}
        aria-label={`Net score ${idea.score}`}
        aria-live="polite"
        className={cn(
          'feedback-score-pop min-w-9 py-0.5 text-center text-sm font-bold tabular-nums',
          hasUpvote && 'text-orange-600 dark:text-orange-400',
          hasDownvote && 'text-blue-600 dark:text-blue-400',
          !hasUpvote && !hasDownvote && 'text-gray-900 dark:text-gray-100'
        )}
      >
        {idea.score}
      </span>
      <span className="sr-only">
        {idea.upvotes} upvotes and {idea.downvotes} downvotes
      </span>

      <button
        type="button"
        aria-label={`Downvote ${idea.title}`}
        aria-pressed={hasDownvote}
        title={hasDownvote ? 'Remove downvote' : 'Downvote'}
        disabled={disabled}
        onClick={() => onVote(SundaySchoolFeedbackVoteType.DOWN)}
        className={cn(
          'group flex h-9 w-9 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 dark:focus-visible:ring-offset-gray-950',
          hasDownvote
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
            : 'text-gray-500 hover:bg-blue-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-950/60 dark:hover:text-blue-400'
        )}
      >
        <ArrowBigDown
          className={cn(
            'h-6 w-6 transition-transform group-active:translate-y-0.5 group-active:scale-90',
            hasDownvote && 'feedback-vote-pop-down fill-current'
          )}
        />
      </button>
    </div>
  )
}

export default function SundaySchoolFeedbackPage() {
  const { status: sessionStatus } = useSundaySchoolGuard()
  const { data, error, isLoading, mutate } = useSundaySchoolFeedback('ALL', 'TOP')
  const response = data as SundaySchoolFeedbackResponse | undefined

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingIdea, setEditingIdea] = useState<SundaySchoolFeedbackIdea | null>(null)
  const [feedbackType, setFeedbackType] = useState<SundaySchoolFeedbackType>(
    SundaySchoolFeedbackType.IDEA
  )
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [votingIdeaId, setVotingIdeaId] = useState<string | null>(null)
  const [statusSavingIdeaId, setStatusSavingIdeaId] = useState<string | null>(null)
  const [deleteIdea, setDeleteIdea] = useState<SundaySchoolFeedbackIdea | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [replyIdea, setReplyIdea] = useState<SundaySchoolFeedbackIdea | null>(null)
  const [teamResponse, setTeamResponse] = useState('')
  const [replySaving, setReplySaving] = useState(false)

  const openCreateDialog = () => {
    setEditingIdea(null)
    setFeedbackType(SundaySchoolFeedbackType.IDEA)
    setTitle('')
    setDescription('')
    setDialogOpen(true)
  }

  const openEditDialog = (idea: SundaySchoolFeedbackIdea) => {
    setEditingIdea(idea)
    setFeedbackType(idea.type)
    setTitle(idea.title)
    setDescription(idea.description ?? '')
    setDialogOpen(true)
  }

  const handleSave = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(
        editingIdea
          ? `/api/sunday-school/feedback/${editingIdea.id}`
          : '/api/sunday-school/feedback',
        {
          method: editingIdea ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: feedbackType, title, description }),
        }
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save feedback')

      setDialogOpen(false)
      setEditingIdea(null)
      setFeedbackType(SundaySchoolFeedbackType.IDEA)
      setTitle('')
      setDescription('')
      await mutate()
      toast.success(editingIdea ? 'Feedback updated' : 'Feedback submitted')
    } catch (saveError: unknown) {
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to save feedback')
    } finally {
      setSaving(false)
    }
  }

  const handleVote = async (
    idea: SundaySchoolFeedbackIdea,
    requestedVote: SundaySchoolFeedbackVoteType
  ) => {
    if (!response || !idea.canVote || votingIdeaId) return
    const nextVote = idea.viewerVote === requestedVote ? null : requestedVote
    const previous = response

    setVotingIdeaId(idea.id)
    await mutate(optimisticVote(previous, idea.id, nextVote), { revalidate: false })

    try {
      const res = await fetch(`/api/sunday-school/feedback/${idea.id}/vote`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: nextVote }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save your vote')
      await mutate()
    } catch (voteError: unknown) {
      await mutate(previous, { revalidate: false })
      toast.error(voteError instanceof Error ? voteError.message : 'Failed to save your vote')
    } finally {
      setVotingIdeaId(null)
    }
  }

  const handleStatusChange = async (
    idea: SundaySchoolFeedbackIdea,
    nextStatus: SundaySchoolFeedbackStatus
  ) => {
    setStatusSavingIdeaId(idea.id)
    try {
      const res = await fetch(`/api/sunday-school/feedback/${idea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to update the status')
      await mutate()
      toast.success(`Idea marked ${STATUS_LABELS[nextStatus].toLowerCase()}`)
    } catch (statusError: unknown) {
      toast.error(
        statusError instanceof Error ? statusError.message : 'Failed to update the status'
      )
    } finally {
      setStatusSavingIdeaId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteIdea) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/sunday-school/feedback/${deleteIdea.id}`, {
        method: 'DELETE',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to delete the idea')
      setDeleteIdea(null)
      await mutate()
      toast.success('Feedback deleted')
    } catch (deleteError: unknown) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Failed to delete the idea')
    } finally {
      setDeleting(false)
    }
  }

  const openReplyDialog = (idea: SundaySchoolFeedbackIdea) => {
    setReplyIdea(idea)
    setTeamResponse(idea.teamResponse ?? '')
  }

  const handleReply = async (event: FormEvent) => {
    event.preventDefault()
    if (!replyIdea) return
    setReplySaving(true)
    try {
      const res = await fetch(`/api/sunday-school/feedback/${replyIdea.id}/response`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: teamResponse }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save the response')
      setReplyIdea(null)
      setTeamResponse('')
      await mutate()
      toast.success('Development Team response published')
    } catch (replyError: unknown) {
      toast.error(replyError instanceof Error ? replyError.message : 'Failed to save the response')
    } finally {
      setReplySaving(false)
    }
  }

  const handleRemoveReply = async () => {
    if (!replyIdea) return
    setReplySaving(true)
    try {
      const res = await fetch(`/api/sunday-school/feedback/${replyIdea.id}/response`, {
        method: 'DELETE',
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to remove the response')
      setReplyIdea(null)
      setTeamResponse('')
      await mutate()
      toast.success('Development Team response removed')
    } catch (replyError: unknown) {
      toast.error(replyError instanceof Error ? replyError.message : 'Failed to remove the response')
    } finally {
      setReplySaving(false)
    }
  }

  if (sessionStatus === 'loading' || isLoading) return <PageLoading />

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Feedback"
          description="Share ideas, request improvements, or report bugs. Vote on feedback to help prioritize what matters most."
          actions={
            response?.viewer.canSubmit ? (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                Post feedback
              </Button>
            ) : undefined
          }
        />

        {error ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="Feedback could not be loaded. Please try again." />
            </CardContent>
          </Card>
        ) : !response?.ideas.length ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="No feedback yet. Post the first idea or bug report!" />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {response.ideas.map(idea => (
              <Card key={idea.id} className="overflow-hidden transition-colors hover:border-gray-300 dark:hover:border-gray-700">
                <CardContent className="flex flex-col-reverse gap-4 pt-6 sm:flex-row sm:gap-5">
                  <FeedbackVoteRail
                    idea={idea}
                    disabled={!idea.canVote || votingIdeaId === idea.id}
                    onVote={vote => handleVote(idea, vote)}
                  />

                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="break-words text-lg font-semibold">{idea.title}</h2>
                          <Badge variant="outline" className={STATUS_STYLES[idea.status]}>
                            {STATUS_LABELS[idea.status]}
                          </Badge>
                          <Badge variant="outline" className={TYPE_STYLES[idea.type]}>
                            {TYPE_LABELS[idea.type]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          Submitted by {idea.submitter?.name ?? 'Former user'} on{' '}
                          {formatSubmittedDate(idea.createdAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {response.viewer.canModerate && (
                          <select
                            aria-label={`Change status for ${idea.title}`}
                            value={idea.status}
                            disabled={statusSavingIdeaId === idea.id}
                            onChange={event =>
                              handleStatusChange(
                                idea,
                                event.target.value as SundaySchoolFeedbackStatus
                              )
                            }
                            className="h-8 rounded-md border bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900"
                          >
                            {Object.values(SundaySchoolFeedbackStatus).map(feedbackStatus => (
                              <option key={feedbackStatus} value={feedbackStatus}>
                                {STATUS_LABELS[feedbackStatus]}
                              </option>
                            ))}
                          </select>
                        )}
                        {response?.viewer.canModerate && (
                          <Button type="button" size="sm" variant="outline" onClick={() => openReplyDialog(idea)}>
                            <MessageSquareReply className="h-4 w-4" />
                            {idea.teamResponse ? 'Edit reply' : 'Reply'}
                          </Button>
                        )}
                        {idea.canEdit && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label={`Edit ${idea.title}`}
                            onClick={() => openEditDialog(idea)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {idea.canDelete && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            aria-label={`Delete ${idea.title}`}
                            onClick={() => setDeleteIdea(idea)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {idea.description && (
                      <p className="whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                        {idea.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      {!idea.canVote && idea.submitter && idea.canEdit && <span>Your idea</span>}
                      {!idea.canVote &&
                        (idea.status === SundaySchoolFeedbackStatus.COMPLETED ||
                          idea.status === SundaySchoolFeedbackStatus.DECLINED) && (
                          <span>Voting closed</span>
                        )}
                    </div>
                    {idea.teamResponse && (
                      <div className="mt-2 rounded-lg border border-line bg-raised px-3 py-2.5">
                        <p className="text-xs font-semibold text-ink">
                          Development Team
                          {idea.teamRespondedAt && (
                            <span className="ml-2 font-normal text-ink-3">
                              · {formatSubmittedDate(idea.teamRespondedAt)}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-[13px] whitespace-pre-wrap break-words text-ink-2">{idea.teamResponse}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSave} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{editingIdea ? 'Edit feedback' : 'Post feedback'}</DialogTitle>
              <DialogDescription>
                Found a problem, or have an idea? Tell the team. Every submission is reviewed.
              </DialogDescription>
            </DialogHeader>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Feedback type</legend>
              <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Feedback type">
                <button
                  type="button"
                  role="radio"
                  aria-checked={feedbackType === SundaySchoolFeedbackType.PROBLEM}
                  onClick={() => setFeedbackType(SundaySchoolFeedbackType.PROBLEM)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500',
                    feedbackType === SundaySchoolFeedbackType.PROBLEM
                      ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200'
                      : 'hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'
                  )}
                >
                  <Bug className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-medium">Problem</span>
                    <span className="block text-xs opacity-75">Something is not working</span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={feedbackType === SundaySchoolFeedbackType.IDEA}
                  onClick={() => setFeedbackType(SundaySchoolFeedbackType.IDEA)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500',
                    feedbackType === SundaySchoolFeedbackType.IDEA
                      ? 'border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900'
                  )}
                >
                  <Lightbulb className="h-5 w-5 shrink-0" />
                  <span>
                    <span className="block font-medium">Idea</span>
                    <span className="block text-xs opacity-75">A suggestion or improvement</span>
                  </span>
                </button>
              </div>
            </fieldset>
            <div className="space-y-2">
              <Label htmlFor="feedback-title">Title</Label>
              <Input
                id="feedback-title"
                value={title}
                onChange={event => setTitle(event.target.value)}
                maxLength={FEEDBACK_TITLE_MAX_LENGTH}
                placeholder="Summarize the idea, improvement, or bug"
                required
                autoFocus
              />
              <p className="text-right text-xs text-gray-500">
                {title.length}/{FEEDBACK_TITLE_MAX_LENGTH}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-description">Details (optional)</Label>
              <Textarea
                id="feedback-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                maxLength={FEEDBACK_DESCRIPTION_MAX_LENGTH}
                rows={6}
                placeholder="Add helpful context. For bugs, include what happened, what you expected, and how to reproduce it."
              />
              <p className="text-right text-xs text-gray-500">
                {description.length}/{FEEDBACK_DESCRIPTION_MAX_LENGTH}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || title.trim().length < 3}>
                {saving ? 'Saving…' : editingIdea ? 'Save changes' : 'Submit feedback'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(replyIdea)} onOpenChange={open => !open && setReplyIdea(null)}>
        <DialogContent>
          <form onSubmit={handleReply} className="space-y-5">
            <DialogHeader>
              <DialogTitle>{replyIdea?.teamResponse ? 'Edit team response' : 'Respond to feedback'}</DialogTitle>
              <DialogDescription>
                This response is visible to everyone on the feedback page as “Development Team”.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="feedback-team-response">Response</Label>
              <Textarea
                id="feedback-team-response"
                value={teamResponse}
                onChange={event => setTeamResponse(event.target.value)}
                maxLength={FEEDBACK_TEAM_RESPONSE_MAX_LENGTH}
                rows={6}
                placeholder="Share an update or answer this feedback…"
                required
              />
              <p className="text-right text-xs text-ink-3">
                {teamResponse.length}/{FEEDBACK_TEAM_RESPONSE_MAX_LENGTH}
              </p>
            </div>
            <DialogFooter>
              {replyIdea?.teamResponse && (
                <Button type="button" variant="destructive" disabled={replySaving} onClick={handleRemoveReply}>
                  Remove response
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => setReplyIdea(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={replySaving || !teamResponse.trim()}>
                {replySaving ? 'Saving…' : 'Publish response'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteIdea)} onOpenChange={open => !open && setDeleteIdea(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this feedback?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteIdea?.title}” and all of its votes will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? 'Deleting…' : 'Delete idea'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
