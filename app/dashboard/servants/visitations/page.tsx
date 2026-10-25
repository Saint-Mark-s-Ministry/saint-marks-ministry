'use client'

import { StudentName } from '@/components/student-history-provider'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SundaySchoolLevel, SundaySchoolPhoneCallOutcome, SundaySchoolVisitationStatus } from '@prisma/client'
import { toast } from 'sonner'
import {
  LockKeyhole,
  MessageSquareText,
  Phone,
  Star,
} from 'lucide-react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { Badge } from '@/components/ui/badge'
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
import { sortClassesByAgeGroup } from '@/lib/sunday-school-class'
import { useSundaySchoolAgeGroups, useSundaySchoolVisitations } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { useViewingClassId } from '@/lib/sunday-school-viewing'
import { CareHubTabs } from '@/components/sunday-school-hub-tabs'
import type {
  SundaySchoolPriestNote,
  SundaySchoolVisitationChild,
  SundaySchoolVisitationsResponse,
} from '@/types/sunday-school'

const TODAY = new Date().toISOString().slice(0, 10)
const CALL_OUTCOME_LABELS: Record<SundaySchoolPhoneCallOutcome, string> = {
  CONNECTED: 'Connected',
  LEFT_VOICEMAIL: 'Left voicemail',
  NO_ANSWER: 'No answer',
  OTHER: 'Other',
}

function VisitationsContent() {
  const searchParams = useSearchParams()
  const requestedChildId = searchParams.get('childId')
  const { status } = useSundaySchoolGuard()
  const { data, error, isLoading, mutate } = useSundaySchoolVisitations()
  const { data: ageGroupsData } = useSundaySchoolAgeGroups()
  const response = data as SundaySchoolVisitationsResponse | undefined
  const classes = useMemo(() => sortClassesByAgeGroup(
    response?.classes ?? [],
    (ageGroupsData as Array<{ levels: SundaySchoolLevel[]; name: string }> | undefined) ?? []
  ), [ageGroupsData, response])

  // A link from Follow up (?childId=) opens that child's class and record.
  const requestedClassId = requestedChildId
    ? classes.find(classroom => classroom.children.some(child => child.id === requestedChildId))?.id
    : searchParams.get('classId')
  const [selectedClassId] = useViewingClassId(classes, { requested: requestedClassId })
  const [search, setSearch] = useState('')
  const [visitView, setVisitView] = useState<'all' | 'not-done' | 'done' | 'priority'>('all')
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [visitationStatus, setVisitationStatus] = useState<SundaySchoolVisitationStatus>(
    SundaySchoolVisitationStatus.DONE
  )
  const [visitedAt, setVisitedAt] = useState(TODAY)
  const [notes, setNotes] = useState('')
  const [savingPriority, setSavingPriority] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [calledAt, setCalledAt] = useState(TODAY)
  const [callOutcome, setCallOutcome] = useState<SundaySchoolPhoneCallOutcome>(
    SundaySchoolPhoneCallOutcome.CONNECTED
  )
  const [callNote, setCallNote] = useState('')
  const [savingCall, setSavingCall] = useState(false)
  const [priestNotes, setPriestNotes] = useState<SundaySchoolPriestNote[]>([])
  const [confidentialNote, setConfidentialNote] = useState('')
  const [loadingPriestNotes, setLoadingPriestNotes] = useState(false)
  const isPriest = response?.standing.isPriest ?? false
  const canReadPrivateNotes = response?.standing.canReadPrivateNotes ?? false

  const selectedClass = classes.find(classroom => classroom.id === selectedClassId) ?? classes[0]
  const selectedChild = classes
    .flatMap(classroom => classroom.children)
    .find(child => child.id === selectedChildId)

  const visibleChildren = useMemo(() => {
    const roster = selectedClass?.children ?? []
    const query = search.trim().toLowerCase()
    if (!query) return roster
    return roster.filter(child =>
      `${child.firstName} ${child.lastName}`.toLowerCase().includes(query)
    )
  }, [search, selectedClass])

  const completedCount = (selectedClass?.children ?? []).filter(
    child => child.visitations[0]?.status === SundaySchoolVisitationStatus.DONE
  ).length
  const notDoneCount = (selectedClass?.children.length ?? 0) - completedCount

  const openChild = (child: SundaySchoolVisitationChild) => {
    setSelectedChildId(child.id)
    setVisitationStatus(SundaySchoolVisitationStatus.DONE)
    setVisitedAt(TODAY)
    setNotes('')
    setCalledAt(TODAY)
    setCallOutcome(SundaySchoolPhoneCallOutcome.CONNECTED)
    setCallNote('')
    setPriestNotes([])
    setConfidentialNote('')
  }

  // Open the linked child once per link, including when a new link arrives while the page is open.
  const openedRequestedChild = useRef<string | null>(null)
  useEffect(() => {
    if (!requestedChildId || openedRequestedChild.current === requestedChildId) return
    const child = classes.flatMap(classroom => classroom.children).find(item => item.id === requestedChildId)
    if (!child) return
    openedRequestedChild.current = requestedChildId
    openChild(child)
  }, [classes, requestedChildId])

  const loadPriestNotes = useCallback(async (childId: string) => {
    setLoadingPriestNotes(true)
    try {
      const res = await fetch(`/api/sunday-school/priest-notes?childId=${encodeURIComponent(childId)}`)
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to load confidential notes')
      }
      setPriestNotes((body.notes ?? []) as SundaySchoolPriestNote[])
    } catch (loadError: unknown) {
      setPriestNotes([])
      toast.error(
        loadError instanceof Error ? loadError.message : 'Failed to load confidential notes'
      )
    } finally {
      setLoadingPriestNotes(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedChildId || !canReadPrivateNotes || (!isPriest && !selectedClass?.canEdit)) {
      setPriestNotes([])
      return
    }
    void loadPriestNotes(selectedChildId)
  }, [canReadPrivateNotes, isPriest, loadPriestNotes, selectedChildId, selectedClass?.canEdit])

  const togglePriority = async (child: SundaySchoolVisitationChild) => {
    setSavingPriority(child.id)
    try {
      const res = await fetch('/api/sunday-school/visitations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId: child.id, priority: !child.visitationPriority }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save priority')
      await mutate()
      toast.success(child.visitationPriority ? 'Removed from priority visits' : 'Added to priority visits')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save priority')
    } finally {
      setSavingPriority(null)
    }
  }

  const handleSave = async () => {
    if (!selectedChild) return

    setSaving(true)
    try {
      const res = await fetch('/api/sunday-school/visitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: selectedChild.id,
          status: visitationStatus,
          visitedAt:
            visitationStatus === SundaySchoolVisitationStatus.DONE ? visitedAt : null,
          notes,
          privateNote: confidentialNote,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save the visitation')
      }

      const savedPrivateNote = confidentialNote.trim().length > 0
      await mutate()
      if (savedPrivateNote && canReadPrivateNotes) {
        await loadPriestNotes(selectedChild.id)
      }
      setNotes('')
      setConfidentialNote('')
      toast.success(savedPrivateNote ? 'Visitation and private note saved' : 'Visitation saved')
    } catch (saveError: unknown) {
      toast.error(
        saveError instanceof Error ? saveError.message : 'Failed to save the visitation'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCall = async () => {
    if (!selectedChild) return

    setSavingCall(true)
    try {
      const res = await fetch('/api/sunday-school/phone-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          childId: selectedChild.id,
          calledAt,
          outcome: callOutcome,
          note: callNote,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save the phone call')
      }

      await mutate()
      setCallNote('')
      toast.success('Phone call logged')
    } catch (saveError: unknown) {
      toast.error(saveError instanceof Error ? saveError.message : 'Failed to save the phone call')
    } finally {
      setSavingCall(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  const isDoneChild = (child: (typeof visibleChildren)[number]) => child.visitations[0]?.status === SundaySchoolVisitationStatus.DONE
  const listed = visibleChildren.filter((child) => (visitView === 'all' ? true : visitView === 'priority' ? child.visitationPriority : visitView === 'done' ? isDoneChild(child) : !isDoneChild(child)))

  return (
    <div className="content-reveal flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader title="Care" meta={[selectedClass?.name, 'Visits and phone calls for each child']} />
        <CareHubTabs />

        {response?.standing.readOnly && (
          <div role="status" className="rounded-lg bg-info-tint px-4 py-2.5 text-[13px] text-info">
            You have read-only access to ministry records. You can review visitations and phone calls for every class
            {isPriest ? ' and add confidential priest notes.' : '.'}
          </div>
        )}

        {error ? (
          <Panel>
            <EmptyState title="Couldn’t load visitations" message="Something went wrong on our side. Try again in a moment." />
          </Panel>
        ) : classes.length === 0 ? (
          <Panel>
            <EmptyState message="You are not assigned to a Sunday School class yet." />
          </Panel>
        ) : (
          <>
            <KpiStrip
              items={[
                { label: 'Children', value: selectedClass?.children.length ?? 0, hint: selectedClass?.name },
                { label: 'Latest visit done', value: completedCount, hint: 'children' },
                { label: 'Not done', value: notDoneCount, hint: 'children', tone: notDoneCount > 0 ? 'warn' : undefined },
              ]}
            />

            <Panel
              toolbar={
                <>
                  <Segmented
                    label="Visitation status"
                    value={visitView}
                    onChange={setVisitView}
                    options={[
                      { value: 'all', label: 'All', count: selectedClass?.children.length ?? 0 },
                      { value: 'not-done', label: 'Not done', count: notDoneCount },
                      { value: 'done', label: 'Done', count: completedCount },
                      { value: 'priority', label: 'Priority visits', count: (selectedClass?.children ?? []).filter(child => child.visitationPriority).length },
                    ]}
                  />
                  <div className="flex w-full flex-wrap items-center gap-2 lg:ml-auto lg:w-auto">
                    <SearchField value={search} onChange={setSearch} placeholder="Find a child" className="flex-1 md:flex-none" />
                  </div>
                </>
              }
            >
              {listed.length === 0 ? (
                <EmptyState message={search || visitView !== 'all' ? 'No children match.' : 'No children are on this roster yet.'} />
              ) : (
                <ul className="divide-y divide-line">
                  {listed.map((child) => {
                    const latest = child.visitations[0]
                    const done = latest?.status === SundaySchoolVisitationStatus.DONE
                    const name = `${child.firstName} ${child.lastName}`
                    return (
                      <li key={child.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_100px_130px_auto]">
                        <span className="flex min-w-0 items-center gap-2.5">
                          {selectedClass?.canEdit ? <Button variant="ghost" size="icon" disabled={savingPriority !== null} aria-pressed={child.visitationPriority} aria-label={`${child.visitationPriority ? 'Remove' : 'Add'} ${name} ${child.visitationPriority ? 'from' : 'to'} priority visits`} onClick={() => void togglePriority(child)}><Star className={child.visitationPriority ? 'fill-warn text-warn' : 'text-ink-3'} /></Button> : child.visitationPriority ? <Star aria-label="Priority visit" className="h-4 w-4 fill-warn text-warn" /> : null}
                          <Initials name={name} />
                          <span className="flex min-w-0 flex-col leading-tight">
                            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate text-[13.5px] font-medium text-ink"><StudentName id={child.id} name={name} program="sunday-school" /></span>
                              {child.visitationPriority && <StatusBadge tone="warn">Priority visit</StatusBadge>}
                            </span>
                            <span className="truncate text-xs text-ink-3">
                              {latest?.notes || (child.visitations.length > 0 ? `${child.visitations.length} ${child.visitations.length === 1 ? 'visit' : 'visits'}` : 'No visits recorded yet')}
                            </span>
                            {child.phoneCalls.length > 0 && (
                              <span className="truncate text-xs text-ink-3">
                                {child.phoneCalls.length} {child.phoneCalls.length === 1 ? 'call' : 'calls'} logged · Latest: {CALL_OUTCOME_LABELS[child.phoneCalls[0].outcome]}
                              </span>
                            )}
                          </span>
                        </span>
                        <span>{latest ? done ? <StatusBadge tone="ok">Done</StatusBadge> : <StatusBadge tone="warn">Not done</StatusBadge> : <StatusBadge tone="neutral">None yet</StatusBadge>}</span>
                        <span className="hidden text-[13px] text-ink-2 md:block">
                          {done && latest.visitedAt ? formatDateUTC(latest.visitedAt, { weekday: undefined, month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </span>
                        <Button variant="outline" size="sm" className="col-span-2 justify-self-start md:col-span-1 md:justify-self-end" onClick={() => openChild(child)}>
                          <MessageSquareText />
                          Follow up
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </>
        )}
      </div>

      <Dialog open={Boolean(selectedChildId)} onOpenChange={open => !open && setSelectedChildId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedChild
                ? `${selectedChild.firstName} ${selectedChild.lastName}`
                : 'Visitation history'}
            </DialogTitle>
            <DialogDescription>
              Phone calls and in-person visits have separate histories.
            </DialogDescription>
          </DialogHeader>

          {selectedChild && (
            <div className="space-y-6">
              {selectedClass?.canEdit && (
                <div className="space-y-4 rounded-lg border bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
                  <h3 className="flex items-center gap-2 font-medium"><Phone className="h-4 w-4" /> Log a phone call</h3>
                  <p className="text-sm text-ink-3">Record follow-up after an absence without changing visitation status. You will be listed as the caller.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="call-date">Date called</Label>
                      <Input id="call-date" type="date" value={calledAt} max={TODAY} onChange={event => setCalledAt(event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="call-outcome">Outcome</Label>
                      <select
                        id="call-outcome"
                        value={callOutcome}
                        onChange={event => setCallOutcome(event.target.value as SundaySchoolPhoneCallOutcome)}
                        className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        {Object.values(SundaySchoolPhoneCallOutcome).map(value => (
                          <option key={value} value={value}>{CALL_OUTCOME_LABELS[value]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="call-note">Call note</Label>
                    <Textarea
                      id="call-note"
                      value={callNote}
                      onChange={event => setCallNote(event.target.value)}
                      placeholder="Summarize the conversation or next follow-up step…"
                      rows={3}
                      maxLength={500}
                    />
                    <p className="text-right text-xs text-gray-500">{callNote.length}/500</p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSaveCall} disabled={savingCall || !calledAt || !callNote.trim()}>
                      {savingCall ? 'Saving…' : 'Log call'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-medium">Phone call history</h3>
                {selectedChild.phoneCalls.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">No phone calls have been logged for this child.</p>
                ) : selectedChild.phoneCalls.map(call => (
                  <div key={call.id} className="rounded-lg border p-4 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="secondary">{CALL_OUTCOME_LABELS[call.outcome]}</Badge>
                      <span className="text-xs text-gray-500">
                        {formatDateUTC(call.calledAt, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm">{call.note}</p>
                    <p className="mt-3 text-xs text-gray-500">Called by {call.callerName}</p>
                  </div>
                ))}
              </div>

              {selectedClass?.canEdit && (
                <div className="space-y-4 rounded-lg border bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
                  <h3 className="font-medium">New visitation entry</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="visitation-status">Status</Label>
                      <select
                        id="visitation-status"
                        value={visitationStatus}
                        onChange={event =>
                          setVisitationStatus(event.target.value as SundaySchoolVisitationStatus)
                        }
                        className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value={SundaySchoolVisitationStatus.DONE}>Done</option>
                        <option value={SundaySchoolVisitationStatus.NOT_DONE}>Not done</option>
                      </select>
                    </div>
                    {visitationStatus === SundaySchoolVisitationStatus.DONE && (
                      <div className="space-y-2">
                        <Label htmlFor="visited-at">Date visited</Label>
                        <Input
                          id="visited-at"
                          type="date"
                          value={visitedAt}
                          max={TODAY}
                          onChange={event => setVisitedAt(event.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visitation-notes">Notes</Label>
                    <Textarea
                      id="visitation-notes"
                      value={notes}
                      onChange={event => setNotes(event.target.value)}
                      placeholder="Add notes or next steps for this visitation…"
                      rows={4}
                      maxLength={5000}
                    />
                    <p className="text-right text-xs text-gray-500">{notes.length}/5,000</p>
                  </div>
                  <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                    <div className="flex items-start gap-2">
                      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
                      <div>
                        <Label htmlFor="visitation-private-note">
                          Private note to priests <span className="font-normal">(optional)</span>
                        </Label>
                        <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                          Attached to this visitation. Priests and the author can read it.
                          Super Admins cannot read confidential notes.
                        </p>
                      </div>
                    </div>
                    <Textarea
                      id="visitation-private-note"
                      value={confidentialNote}
                      onChange={event => setConfidentialNote(event.target.value)}
                      placeholder="Add confidential note…"
                      rows={3}
                      maxLength={5000}
                    />
                    <p className="text-right text-xs text-amber-800 dark:text-amber-300">
                      {confidentialNote.length}/5,000
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving…' : 'Save entry'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-medium">Visitation history</h3>
                {selectedChild.visitations.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
                    No visitations have been recorded for this child.
                  </p>
                ) : (
                  selectedChild.visitations.map(visitation => (
                    <div key={visitation.id} className="rounded-lg border p-4 dark:border-gray-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge
                          className={
                            visitation.status === SundaySchoolVisitationStatus.DONE
                              ? 'bg-emerald-600 hover:bg-emerald-600'
                              : 'bg-amber-600 hover:bg-amber-600'
                          }
                        >
                          {visitation.status === SundaySchoolVisitationStatus.DONE ? 'Done' : 'Not done'}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {visitation.status === SundaySchoolVisitationStatus.DONE && visitation.visitedAt
                            ? formatDateUTC(visitation.visitedAt, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : formatDateUTC(visitation.createdAt, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                        </span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm">
                        {visitation.notes || 'No notes were added.'}
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        Recorded by {visitation.recorder?.name ?? 'Unknown servant'}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {canReadPrivateNotes && (isPriest || selectedClass?.canEdit) && (
                <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <div>
                      <h3 className="font-medium text-amber-950 dark:text-amber-100">
                        Private notes to priests
                      </h3>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                        {isPriest
                          ? 'Confidential. These notes are available to priests and their author. Super Admins cannot read them, including in View as mode.'
                          : 'Private notes saved with your visitation entries are visible to you and priests. Super Admins cannot read them, including in View as mode.'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-sm font-medium">
                      {isPriest ? 'Confidential history' : 'Your private notes'}
                    </h4>
                    {loadingPriestNotes ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        Loading confidential notes…
                      </p>
                    ) : priestNotes.length === 0 ? (
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {isPriest
                          ? 'No priest-only notes have been added for this child.'
                          : 'You have not sent a private note about this child.'}
                      </p>
                    ) : (
                      priestNotes.map(priestNote => (
                        <div
                          key={priestNote.id}
                          className="rounded-md border border-amber-200 bg-white/70 p-3 dark:border-amber-900 dark:bg-gray-950/50"
                        >
                          <p className="whitespace-pre-wrap text-sm">{priestNote.content}</p>
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            {isPriest ? priestNote.author.name : 'You'} ·{' '}
                            {formatDateUTC(priestNote.createdAt, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                            Related visitation:{' '}
                            {priestNote.visitation.status === SundaySchoolVisitationStatus.DONE
                              ? 'Done'
                              : 'Not done'}{' '}
                            ·{' '}
                            {formatDateUTC(
                              priestNote.visitation.visitedAt ?? priestNote.visitation.createdAt,
                              { month: 'short', day: 'numeric', year: 'numeric' }
                            )}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedChildId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SundaySchoolVisitationsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <VisitationsContent />
    </Suspense>
  )
}
