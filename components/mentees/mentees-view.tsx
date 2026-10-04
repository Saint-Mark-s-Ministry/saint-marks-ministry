'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { Session } from 'next-auth'
import { UserRole } from '@prisma/client'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronUp, Trash2, UserX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading } from '@/components/ui/page-loading'
import { PageHeader } from '@/components/ds/page-header'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Panel } from '@/components/ds/panel'
import { Metric } from '@/components/ds/metric'
import { Initials } from '@/components/ds/person'
import { StatusBadge } from '@/components/ds/status-badge'
import { getRoleDisplayName, isAdmin } from '@/lib/roles'
import { SECTION_DISPLAY_NAMES } from '@/lib/constants'
import type { MenteeAnalytics } from '@/lib/types'
import { cn } from '@/lib/utils'

interface StudentNote {
  id: string
  content: string
  createdAt: string | Date
  author: { id: string; name: string; role: UserRole }
}

interface Mentee {
  id: string
  student: { id: string; name: string; email: string; phone?: string; profileImageUrl?: string | null }
  yearLevel: string
  status: string
  fatherOfConfession?: { name: string } | null
  analytics?: MenteeAnalytics
}

/**
 * Mentees with their graduation requirements, attendance, exams and notes.
 * Mentors and admins see the students they mentor; priests see everyone.
 * Used by /dashboard/mentor/my-mentees and /dashboard/admin/mentees.
 */
export function MenteesView({ session }: { session: Session | null }) {
  const [mentees, setMentees] = useState<Mentee[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [notesMap, setNotesMap] = useState<Record<string, StudentNote[]>>({})
  const [notesLoading, setNotesLoading] = useState<Record<string, boolean>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({})

  const userId = session?.user?.id
  const isPriest = session?.user?.role === 'PRIEST'

  useEffect(() => {
    if (!userId) return
    const load = async () => {
      try {
        const res = await fetch(isPriest ? '/api/enrollments' : `/api/enrollments?mentorId=${userId}`)
        if (!res.ok) return
        const data: Mentee[] = await res.json()
        // Analytics aggregate across all years, since graduation spans Year 1 and Year 2.
        const withAnalytics = await Promise.all(
          data.map(async (mentee) => {
            try {
              const a = await fetch(`/api/students/${mentee.student.id}/analytics`)
              if (a.ok) return { ...mentee, analytics: (await a.json()) as MenteeAnalytics }
            } catch (error: unknown) {
              console.error('Failed to fetch analytics for mentee:', error)
            }
            return mentee
          })
        )
        setMentees(withAnalytics.filter((m) => m.student))
      } catch (error: unknown) {
        console.error('Failed to fetch mentees:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId, isPriest])

  const fetchNotes = async (studentId: string) => {
    setNotesLoading((prev) => ({ ...prev, [studentId]: true }))
    try {
      const res = await fetch(`/api/students/${studentId}/notes`)
      if (res.ok) {
        const data: StudentNote[] = await res.json()
        setNotesMap((prev) => ({ ...prev, [studentId]: data }))
      }
    } catch (error: unknown) {
      console.error('Failed to fetch notes:', error)
    } finally {
      setNotesLoading((prev) => ({ ...prev, [studentId]: false }))
    }
  }

  const toggle = (mentee: Mentee) => {
    const next = expanded === mentee.id ? null : mentee.id
    setExpanded(next)
    if (next && !notesMap[mentee.student.id]) fetchNotes(mentee.student.id)
  }

  const addNote = async (studentId: string) => {
    const content = draft[studentId]?.trim()
    if (!content) return
    setSubmitting((prev) => ({ ...prev, [studentId]: true }))
    try {
      const res = await fetch(`/api/students/${studentId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const note: StudentNote = await res.json()
        setNotesMap((prev) => ({ ...prev, [studentId]: [note, ...(prev[studentId] || [])] }))
        setDraft((prev) => ({ ...prev, [studentId]: '' }))
        toast.success('Note saved')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add note')
      }
    } catch (error: unknown) {
      console.error('Failed to add note:', error)
      toast.error('Failed to add note')
    } finally {
      setSubmitting((prev) => ({ ...prev, [studentId]: false }))
    }
  }

  const deleteNote = async (studentId: string, noteId: string) => {
    if (!confirm('Delete this note?')) return
    try {
      const res = await fetch(`/api/student-notes/${noteId}`, { method: 'DELETE' })
      if (res.ok) {
        setNotesMap((prev) => ({ ...prev, [studentId]: (prev[studentId] || []).filter((n) => n.id !== noteId) }))
        toast.success('Note deleted')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete note')
      }
    } catch (error: unknown) {
      console.error('Failed to delete note:', error)
      toast.error('Failed to delete note')
    }
  }

  if (loading) return <PageLoading />

  const atRisk = mentees.filter((m) => m.analytics && !m.analytics.graduation.eligible)
  const onTrack = mentees.filter((m) => m.analytics?.graduation.eligible)
  const averages = mentees.map((m) => m.analytics?.exams.overallAverage).filter((v): v is number => v !== null && v !== undefined)
  const overallAverage = averages.length ? averages.reduce((a, b) => a + b, 0) / averages.length : null
  // At-risk first, so the people who need attention lead (research finding 03).
  const ordered = [...atRisk, ...mentees.filter((m) => !atRisk.includes(m))]
  const noun = isPriest ? 'students' : 'mentees'

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={isPriest ? 'All students' : 'My mentees'}
        meta={['Graduation requirements and progress', `${mentees.length} ${mentees.length === 1 ? noun.slice(0, -1) : noun}`]}
      />

      {mentees.length > 0 && (
        <KpiStrip
          items={[
            { label: isPriest ? 'Total students' : 'Total mentees', value: mentees.length },
            { label: 'On track', value: onTrack.length, hint: 'meeting every requirement' },
            { label: 'At risk', value: atRisk.length, hint: 'missing a requirement', tone: atRisk.length ? 'bad' : undefined },
            {
              label: 'Overall average',
              value: overallAverage === null ? '—' : `${overallAverage.toFixed(1)}%`,
              hint: 'exam average',
              tone: overallAverage !== null && overallAverage < 75 ? 'warn' : undefined,
            },
          ]}
        />
      )}

      {mentees.length === 0 ? (
        <Panel>
          <EmptyState
            title={isPriest ? 'No students enrolled' : 'No mentees yet'}
            message={isPriest ? 'No students are enrolled in the program right now.' : 'Ask an administrator to assign mentees to you.'}
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((mentee) => (
            <MenteeCard
              key={mentee.id}
              mentee={mentee}
              expanded={expanded === mentee.id}
              onToggle={() => toggle(mentee)}
              notes={
                <NotesSection
                  notes={notesMap[mentee.student.id]}
                  loading={notesLoading[mentee.student.id]}
                  draft={draft[mentee.student.id] || ''}
                  submitting={!!submitting[mentee.student.id]}
                  onDraft={(value) => setDraft((prev) => ({ ...prev, [mentee.student.id]: value }))}
                  onAdd={() => addNote(mentee.student.id)}
                  onDelete={(noteId) => deleteNote(mentee.student.id, noteId)}
                  canDelete={(note) =>
                    session?.user?.id === note.author.id || (!!session?.user?.role && isAdmin(session.user.role as UserRole))
                  }
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Requirement({ met, label }: { met: boolean | undefined; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px]', met ? 'text-ok' : 'text-bad')}>
      {met ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <X className="size-3.5" strokeWidth={2.5} aria-hidden />}
      <span className="text-ink-2">{label}</span>
      <span className="sr-only">{met ? 'met' : 'not met'}</span>
    </span>
  )
}

function MenteeCard({
  mentee,
  expanded,
  onToggle,
  notes,
}: {
  mentee: Mentee
  expanded: boolean
  onToggle: () => void
  notes: React.ReactNode
}) {
  const a = mentee.analytics
  const att = a?.attendance
  const detailsId = `mentee-${mentee.id}-details`
  return (
    <Panel>
      <div className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 items-center gap-3 lg:w-72">
          <Initials name={mentee.student.name} imageUrl={mentee.student.profileImageUrl} size={40} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/admin/students?student=${mentee.student.id}`}
                className="truncate text-[15px] font-semibold text-ink no-underline hover:underline"
              >
                {mentee.student.name}
              </Link>
              {a && (a.graduation.eligible ? <StatusBadge tone="ok">On track</StatusBadge> : <StatusBadge tone="bad">At risk</StatusBadge>)}
            </div>
            <span className="truncate text-xs text-ink-3">
              Year {mentee.yearLevel === 'YEAR_1' ? '1' : '2'}
              {mentee.fatherOfConfession?.name ? ` · ${mentee.fatherOfConfession.name}` : ` · ${mentee.student.email}`}
            </span>
          </div>
        </div>

        {a ? (
          <>
            <div className="grid flex-1 grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-3">Attendance</span>
                <Metric value={att?.percentage} width={72} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-3">Exam average</span>
                <Metric value={a.exams.overallAverage} width={72} />
              </div>
            </div>
            <dl className="tabular grid grid-cols-4 gap-3 text-center lg:w-64">
              {[
                ['Present', att?.presentCount, 'text-ok'],
                ['Late', att?.lateCount, 'text-warn'],
                ['Absent', att?.absentCount, 'text-bad'],
                ['Excused', (att?.excusedCount ?? 0) - (att?.expectedAbsenceNACount ?? 0), 'text-info'],
              ].map(([label, value, ink]) => (
                <div key={label as string} className="flex flex-col">
                  <dd className={cn('text-lg leading-tight font-semibold', ink as string)}>{value as number}</dd>
                  <dt className="text-[11px] text-ink-3">{label as string}</dt>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="flex-1 text-[13px] text-ink-3">No attendance or exam data yet.</p>
        )}

        <Button variant="outline" size="sm" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId} className="self-start lg:self-center">
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? 'Hide details' : 'Show details'}
        </Button>
      </div>

      {a && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line px-4 py-2.5">
          <Requirement met={a.graduation.attendanceMet} label="Attendance ≥ 75%" />
          <Requirement met={a.graduation.overallAverageMet} label="Exam avg ≥ 75%" />
          <Requirement met={a.graduation.allSectionsPassing} label="All sections ≥ 60%" />
          {att && att.conductDismissalCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-bad">
              <UserX className="size-3.5" aria-hidden />
              Removed from lesson {att.conductDismissalCount}×
            </span>
          )}
        </div>
      )}

      {expanded && (
        <div id={detailsId} className="grid gap-5 border-t border-line px-4 py-4 lg:grid-cols-2">
          {a && (
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-ink">
                Exam performance{' '}
                <span className="font-normal text-ink-3">
                  · {a.exams.examsTaken} of {a.exams.totalApplicableExams} taken
                </span>
              </h3>
              {a.exams.sectionAverages.length === 0 ? (
                <p className="text-[13px] text-ink-3">No exam scores recorded yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                  {a.exams.sectionAverages.map((section) => (
                    <li key={section.section} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                      <span className="min-w-0 truncate">
                        {SECTION_DISPLAY_NAMES[section.section] || section.section}
                        <span className="ml-1.5 text-xs text-ink-3">· {section.scores.length} exam{section.scores.length !== 1 ? 's' : ''}</span>
                      </span>
                      <Metric value={section.average} target={60} floor={50} width={48} />
                    </li>
                  ))}
                </ul>
              )}
              {a.exams.missingExams?.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="text-xs font-medium text-warn">Not taken ({a.exams.missingExams.length})</h4>
                  <ul className="flex flex-col gap-1">
                    {a.exams.missingExams.map((exam) => (
                      <li key={exam.id} className="flex items-center justify-between gap-2 text-[13px]">
                        <span className="truncate">{exam.sectionDisplayName}</span>
                        <span className="text-xs text-ink-3">
                          {new Date(exam.examDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {att && (
                <p className="text-xs text-ink-3">
                  Attendance = (present + late ÷ 2) ÷ (lessons − excused) = {att.effectivePresent.toFixed(1)} ÷ {att.totalLessons}
                </p>
              )}
            </section>
          )}
          {notes}
        </div>
      )}
    </Panel>
  )
}

function NotesSection({
  notes,
  loading,
  draft,
  submitting,
  onDraft,
  onAdd,
  onDelete,
  canDelete,
}: {
  notes?: StudentNote[]
  loading?: boolean
  draft: string
  submitting: boolean
  onDraft: (value: string) => void
  onAdd: () => void
  onDelete: (noteId: string) => void
  canDelete: (note: StudentNote) => boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-ink">Notes</h3>
        <p className="text-xs text-ink-3">Visible to mentors and admins</p>
      </div>
      {loading ? (
        <p className="text-[13px] text-ink-3">Loading notes…</p>
      ) : notes && notes.length > 0 ? (
        <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
          {notes.map((note) => (
            <li key={note.id} className="rounded-md bg-raised px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{note.author.name}</span> · {getRoleDisplayName(note.author.role)} ·{' '}
                  {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
                {canDelete(note) && (
                  <button
                    type="button"
                    onClick={() => onDelete(note.id)}
                    aria-label="Delete note"
                    className="-m-1 cursor-pointer rounded p-1 text-ink-3 hover:text-bad"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[13px] whitespace-pre-wrap text-ink">{note.content}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-3">No notes yet.</p>
      )}
      <Textarea aria-label="Add a note" placeholder="Add a note…" rows={2} value={draft} onChange={(e) => onDraft(e.target.value)} />
      <Button size="sm" className="self-end" onClick={onAdd} disabled={submitting || !draft.trim()}>
        {submitting ? 'Saving…' : 'Save note'}
      </Button>
    </section>
  )
}
