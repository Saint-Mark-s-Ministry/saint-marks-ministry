'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SundaySchoolPhoneCallOutcome, SundaySchoolVisitationStatus } from '@prisma/client'
import { toast } from 'sonner'
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  LockKeyhole,
  MessageSquareText,
  Phone,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { getLevelDisplayName } from '@/lib/sunday-school-class'
import { useSundaySchoolVisitations } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
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

export default function SundaySchoolVisitationsPage() {
  const { status } = useSundaySchoolGuard()
  const { data, error, isLoading, mutate } = useSundaySchoolVisitations()
  const response = data as SundaySchoolVisitationsResponse | undefined
  const classes = useMemo(() => response?.classes ?? [], [response])

  const [selectedClassId, setSelectedClassId] = useState('')
  const [search, setSearch] = useState('')
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null)
  const [visitationStatus, setVisitationStatus] = useState<SundaySchoolVisitationStatus>(
    SundaySchoolVisitationStatus.DONE
  )
  const [visitedAt, setVisitedAt] = useState(TODAY)
  const [notes, setNotes] = useState('')
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

  useEffect(() => {
    if (!selectedClassId && classes.length > 0) {
      setSelectedClassId(classes[0].id)
    }
  }, [classes, selectedClassId])

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
    if (!selectedChildId || (!isPriest && !selectedClass?.canEdit)) {
      setPriestNotes([])
      return
    }
    void loadPriestNotes(selectedChildId)
  }, [isPriest, loadPriestNotes, selectedChildId, selectedClass?.canEdit])

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
      if (savedPrivateNote) {
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

  return (
    <div className="min-h-screen bg-gray-50 p-4 dark:bg-gray-950 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Visitations"
          description="Track visitations and phone call follow-up for every child in your Sunday School classes."
        />

        {response?.standing.readOnly && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            You have read-only access to ministry records. You can review visitations and phone calls for every class
            {isPriest ? ' and add confidential priest notes.' : '.'}
          </div>
        )}

        {error ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="Visitations could not be loaded. Please try again." />
            </CardContent>
          </Card>
        ) : classes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="You are not assigned to any Sunday School class yet." />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="grid gap-4 pt-6 sm:grid-cols-[minmax(240px,1fr)_minmax(220px,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="visitation-class">Class</Label>
                  <select
                    id="visitation-class"
                    value={selectedClass?.id ?? ''}
                    onChange={event => {
                      setSelectedClassId(event.target.value)
                      setSelectedChildId(null)
                    }}
                    className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                  >
                    {classes.map(classroom => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name} — {getLevelDisplayName(classroom.level)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visitation-search">Find a child</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <Input
                      id="visitation-search"
                      value={search}
                      onChange={event => setSearch(event.target.value)}
                      placeholder="Search by name"
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-3">
              <SummaryCard
                icon={<ClipboardList className="h-5 w-5 text-maroon-600" />}
                value={selectedClass?.children.length ?? 0}
                label="Children"
              />
              <SummaryCard
                icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                value={completedCount}
                label="Latest visit done"
              />
              <SummaryCard
                icon={<CalendarCheck className="h-5 w-5 text-amber-600" />}
                value={notDoneCount}
                label="Not done"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{selectedClass?.name ?? 'Class roster'}</CardTitle>
              </CardHeader>
              <CardContent>
                {visibleChildren.length === 0 ? (
                  <EmptyState
                    message={search ? 'No children match that search.' : 'No children are on this roster yet.'}
                  />
                ) : (
                  <div className="divide-y dark:divide-gray-800">
                    {visibleChildren.map(child => {
                      const latest = child.visitations[0]
                      const isDone = latest?.status === SundaySchoolVisitationStatus.DONE
                      const latestCall = child.phoneCalls[0]

                      return (
                        <div
                          key={child.id}
                          className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">
                                {child.firstName} {child.lastName}
                              </p>
                              <Badge
                                className={
                                  isDone
                                    ? 'bg-emerald-600 hover:bg-emerald-600'
                                    : 'bg-amber-600 hover:bg-amber-600'
                                }
                              >
                                {isDone ? 'Done' : 'Not done'}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                              {isDone && latest.visitedAt
                                ? `Last visited ${formatDateUTC(latest.visitedAt, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}`
                                : latest
                                  ? 'Follow-up recorded as not done'
                                  : 'No visitations recorded yet'}
                              {child.visitations.length > 0 &&
                                ` · ${child.visitations.length} ${child.visitations.length === 1 ? 'entry' : 'entries'}`}
                            </p>
                            {latest?.notes && (
                              <p className="mt-1 max-w-2xl truncate text-sm text-gray-500 dark:text-gray-500">
                                {latest.notes}
                              </p>
                            )}
                            {child.phoneCalls.length > 0 && (
                              <p className="mt-1 text-sm text-gray-500 dark:text-gray-500">
                                <Phone className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                                {child.phoneCalls.length} {child.phoneCalls.length === 1 ? 'call' : 'calls'} logged · Latest: {CALL_OUTCOME_LABELS[latestCall.outcome]}
                              </p>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openChild(child)}
                            className="shrink-0 self-start sm:self-auto"
                          >
                            <MessageSquareText className="mr-1 h-4 w-4" />
                            {child.visitations.length > 0 || child.phoneCalls.length > 0 ? 'View history' : 'Add visitation'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
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
                          Attached to this visitation. Only you and users with an active Priest
                          access tag can read it.
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

              {(isPriest || selectedClass?.canEdit) && (
                <div className="space-y-4 rounded-lg border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <div className="flex items-start gap-3">
                    <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
                    <div>
                      <h3 className="font-medium text-amber-950 dark:text-amber-100">
                        Private notes to priests
                      </h3>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                        {isPriest
                          ? 'Confidential. These notes are available only to users with an active Priest access tag and never appear in the shared visitation history.'
                          : 'Private notes saved with your visitation entries are visible only to you and users with an active Priest access tag.'}
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

function SummaryCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode
  value: number
  label: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
