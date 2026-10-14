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
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Map,
  MessageSquare,
  MessageSquareReply,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
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
import { Button } from '@/components/ui/button'
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
  type FeedbackSort,
  sortFeedbackIdeas,
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

const STATUS_TONE: Record<SundaySchoolFeedbackStatus, Tone> = {
  OPEN: 'info',
  PLANNED: 'accent',
  IN_PROGRESS: 'warn',
  COMPLETED: 'ok',
  DECLINED: 'neutral',
}

const TYPE_LABELS: Record<SundaySchoolFeedbackType, string> = {
  PROBLEM: 'Problem',
  IDEA: 'Idea',
}

const TYPE_TONE: Record<SundaySchoolFeedbackType, Tone> = {
  PROBLEM: 'bad',
  IDEA: 'gold',
}

const ROADMAP_STATUSES = [
  SundaySchoolFeedbackStatus.PLANNED,
  SundaySchoolFeedbackStatus.IN_PROGRESS,
  SundaySchoolFeedbackStatus.COMPLETED,
] as const

const ROADMAP_DESCRIPTIONS = {
  PLANNED: 'On the horizon',
  IN_PROGRESS: 'Being worked on',
  COMPLETED: 'Ready to use',
} as const

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
      className="flex h-fit w-fit shrink-0 flex-col items-center rounded-md border border-line bg-raised p-0.5"
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
            ? 'bg-orange-100 text-orange-600 dark:text-orange-400'
            : 'text-gray-500 hover:bg-orange-100 hover:text-orange-600 dark:text-gray-400 dark:hover:text-orange-400'
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
            ? 'bg-blue-100 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 hover:bg-blue-100 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400'
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
  const [view, setView] = useState<'board' | 'roadmap'>('board')
  const [typeFilter, setTypeFilter] = useState<'ALL' | SundaySchoolFeedbackType>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | SundaySchoolFeedbackStatus>('ALL')
  const [sort, setSort] = useState<FeedbackSort>('TOP')
  const [search, setSearch] = useState('')
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null)

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

  const allIdeas = response?.ideas ?? []
  const query = search.trim().toLowerCase()
  const ideas = sortFeedbackIdeas(
    allIdeas.filter(idea =>
      (typeFilter === 'ALL' || idea.type === typeFilter) &&
      (view === 'roadmap' || statusFilter === 'ALL' || idea.status === statusFilter) &&
      (!query || [idea.title, idea.description, idea.teamResponse, idea.submitter?.name]
        .some(value => value?.toLowerCase().includes(query)))
    ),
    sort
  )
  const selectedIdea = allIdeas.find(idea => idea.id === selectedIdeaId)
  const hasFilters = Boolean(query) || typeFilter !== 'ALL' || (view === 'board' && statusFilter !== 'ALL')
  const clearFilters = () => {
    setSearch('')
    setTypeFilter('ALL')
    setStatusFilter('ALL')
  }
  const renderEntry = (idea: SundaySchoolFeedbackIdea, detail = false) => (
    <div className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
      <FeedbackVoteRail idea={idea} disabled={!idea.canVote || Boolean(votingIdeaId)} onVote={(vote) => handleVote(idea, vote)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={TYPE_TONE[idea.type]} dot={false}>{TYPE_LABELS[idea.type]}</StatusBadge>
              <StatusBadge tone={STATUS_TONE[idea.status]}>{STATUS_LABELS[idea.status]}</StatusBadge>
            </div>
            {!detail && (
              <h2>
                <button
                  type="button"
                  onClick={() => setSelectedIdeaId(idea.id)}
                  className="group flex items-start gap-2 text-left text-[15px] font-semibold break-words text-ink transition-colors hover:text-accent-ink focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent-ink"
                >
                  {idea.title}
                  <ChevronRight aria-hidden className="mt-1 size-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                </button>
              </h2>
            )}
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-1">
            {response?.viewer.canModerate && (
              <select
                aria-label={`Change status for ${idea.title}`}
                value={idea.status}
                disabled={statusSavingIdeaId === idea.id}
                onChange={(event) => handleStatusChange(idea, event.target.value as SundaySchoolFeedbackStatus)}
                className="h-9 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink md:h-[30px] md:text-xs"
              >
                {Object.values(SundaySchoolFeedbackStatus).map((feedbackStatus) => (
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
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edit ${idea.title}`} onClick={() => openEditDialog(idea)}>
                <Pencil />
              </Button>
            )}
            {idea.canDelete && (
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Delete ${idea.title}`} className="hover:text-bad" onClick={() => setDeleteIdea(idea)}>
                <Trash2 />
              </Button>
            )}
          </div>
        </div>
        {idea.description && <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words text-ink-2">{idea.description}</p>}
        <p className="text-xs break-words text-ink-3">
          {idea.submitter?.name ?? 'Former user'} · {formatSubmittedDate(idea.createdAt)}
          {!idea.canVote && idea.submitter && idea.canEdit && ' · Your idea'}
          {!idea.canVote &&
            (idea.status === SundaySchoolFeedbackStatus.COMPLETED || idea.status === SundaySchoolFeedbackStatus.DECLINED) &&
            ' · Voting closed'}
        </p>
        {idea.teamResponse && (
          <div className="mt-2 rounded-lg border border-accent-ink/15 bg-accent-tint/40 px-3 py-2.5">
            <p className="text-xs font-semibold text-ink">
              Development Team
              {idea.teamRespondedAt && (
                <span className="ml-2 font-normal text-ink-3">
                  · {formatSubmittedDate(idea.teamRespondedAt)}
                </span>
              )}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-ink-2">{idea.teamResponse}</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Feedback"
        meta={['Share ideas, request improvements, or report bugs. Help shape what comes next.']}
        actions={response?.viewer.canSubmit ? (
          <Button onClick={openCreateDialog}>
            <Plus aria-hidden />
            Post feedback
          </Button>
        ) : undefined}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <Segmented
          label="Feedback views"
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: <><MessageSquare aria-hidden className="size-3.5" /> Feedback board</> },
            { value: 'roadmap', label: <><Map aria-hidden className="size-3.5" /> Roadmap</> },
          ]}
        />
        <p className="text-xs text-ink-3">Your feedback helps improve the ministry app.</p>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-full sm:basis-48">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input
              aria-label="Search feedback"
              placeholder="Search feedback…"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
          <select aria-label="Filter feedback type" value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="h-9 max-w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink">
            <option value="ALL">All feedback</option>
            <option value="IDEA">Ideas</option>
            <option value="PROBLEM">Problems</option>
          </select>
          {view === 'board' && (
            <select aria-label="Filter feedback status" value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 max-w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink">
              <option value="ALL">All statuses</option>
              {Object.values(SundaySchoolFeedbackStatus).map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          )}
          <select aria-label="Sort feedback" value={sort} onChange={event => setSort(event.target.value as FeedbackSort)} className="h-9 max-w-full rounded-md border border-line-strong bg-surface px-3 text-[13px] text-ink">
            <option value="TOP">Top voted</option>
            <option value="NEWEST">Newest</option>
          </select>
          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
        </div>

        {error ? (
          <Panel>
            <EmptyState title="Couldn’t load feedback" message="Something went wrong on our side. Try again in a moment." action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>} />
          </Panel>
        ) : view === 'board' ? (
          <Panel
            title="Community feedback"
            actions={<span aria-live="polite" className="text-xs tabular-nums text-ink-3">{ideas.length} {ideas.length === 1 ? 'post' : 'posts'}</span>}
          >
            {ideas.length === 0 ? (
              <EmptyState
                icon={<MessageSquare />}
                title={allIdeas.length ? 'No matching feedback' : 'Start the conversation'}
                message={allIdeas.length ? 'Try another search or clear your filters.' : 'Share an idea or report a problem to help improve the app.'}
                action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Clear filters</Button> : response?.viewer.canSubmit ? <Button onClick={openCreateDialog}>Post the first feedback</Button> : undefined}
              />
            ) : (
              <ul className="divide-y divide-line">
                {ideas.map(idea => <li key={idea.id} className="transition-colors hover:bg-hover/40">{renderEntry(idea)}</li>)}
              </ul>
            )}
          </Panel>
        ) : (
          <>
            <p className="text-[13px] text-ink-3">See what’s planned, what’s being worked on, and what’s ready to use.</p>
            <div className="grid min-w-0 gap-4 xl:grid-cols-3">
              {ROADMAP_STATUSES.map(status => {
                const columnIdeas = ideas.filter(idea => idea.status === status)
                return (
                  <section key={status} aria-label={`${STATUS_LABELS[status]} feedback`} className="min-w-0 rounded-lg border border-line bg-raised/50 p-3">
                    <header className="mb-3 flex items-center justify-between gap-2 px-1">
                      <div>
                        <h2><StatusBadge tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</StatusBadge></h2>
                        <p className="mt-1.5 text-xs text-ink-3">{ROADMAP_DESCRIPTIONS[status]}</p>
                      </div>
                      <span aria-label={`${columnIdeas.length} posts`} className="rounded-md border border-line bg-surface px-2 py-1 text-xs tabular-nums text-ink-3">{columnIdeas.length}</span>
                    </header>
                    {columnIdeas.length ? (
                      <ul className="space-y-3">
                        {columnIdeas.map(idea => <li key={idea.id} className="overflow-hidden rounded-lg border border-line bg-surface">{renderEntry(idea)}</li>)}
                      </ul>
                    ) : (
                      <EmptyState
                        icon={status === 'COMPLETED' ? <CheckCircle2 /> : <Map />}
                        message={hasFilters ? 'No matching feedback in this stage.' : `No ${STATUS_LABELS[status].toLowerCase()} feedback yet.`}
                        className="rounded-lg border border-dashed border-line py-8"
                      />
                    )}
                  </section>
                )
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(selectedIdea)} onOpenChange={open => !open && setSelectedIdeaId(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-5 break-words">{selectedIdea?.title}</DialogTitle>
            <DialogDescription>Feedback details and the latest team response.</DialogDescription>
          </DialogHeader>
          {selectedIdea && renderEntry(selectedIdea, true)}
        </DialogContent>
      </Dialog>

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
