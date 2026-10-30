'use client'

import type { SundaySchoolLevel } from '@prisma/client'
import { StudentName } from '@/components/student-history-provider'

import { useEffect, useMemo, useState } from 'react'
import { BookOpenCheck, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FilterSelect } from '@/components/ui/filter-select'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useViewingClassId } from '@/lib/sunday-school-viewing'
import { useSundaySchoolMemorizations } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import {
  MEMORIZATION_MAX_SCORE,
  MEMORIZATION_MIN_SCORE,
  summarizeMemorizationScores,
} from '@/lib/sunday-school-memorization'

interface ChildRow { id: string; firstName: string; lastName: string }
interface ScoreRow { childId: string; score: number; notes: string | null }
interface MemorizationRow {
  id: string
  title: string
  instructions: string | null
  dueDate: string | null
  scores: ScoreRow[]
}
interface ClassOption { id: string; name: string; level: SundaySchoolLevel; canEdit: boolean }
interface MemorizationResponse {
  classes: ClassOption[]
  roster: ChildRow[]
  memorizations: MemorizationRow[]
}
type Draft = { score: string; notes: string }

export default function SundaySchoolMemorizationPage() {
  const { session, status } = useSundaySchoolGuard()
  const [loadedClasses, setLoadedClasses] = useState<ClassOption[]>()
  const [classId, setClassId, scopedClasses] = useViewingClassId(loadedClasses)
  const { data, error, isLoading, mutate } = useSundaySchoolMemorizations(classId || undefined)
  const response = data as MemorizationResponse | undefined
  if (response?.classes && response.classes !== loadedClasses) setLoadedClasses(response.classes)

  const classes = useMemo(() => response?.classes ?? [], [response?.classes])
  const memorizations = useMemo(() => response?.memorizations ?? [], [response?.memorizations])
  const roster = useMemo(() => response?.roster ?? [], [response?.roster])
  const selectedClass = classes.find(cls => cls.id === classId)
  const canEdit = Boolean(selectedClass?.canEdit)

  const [itemId, setItemId] = useState('')
  const selected = memorizations.find(item => item.id === itemId) ?? memorizations[0] ?? null
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<MemorizationRow | null>(null)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')

  useEffect(() => {
    const next: Record<string, Draft> = {}
    for (const child of roster) next[child.id] = { score: '', notes: '' }
    for (const score of selected?.scores ?? []) {
      next[score.childId] = { score: String(score.score), notes: score.notes ?? '' }
    }
    setDrafts(next)
  }, [roster, selected])

  const openEditor = (item: MemorizationRow | null) => {
    setEditing(item)
    setTitle(item?.title ?? '')
    setInstructions(item?.instructions ?? '')
    setDueDate(item?.dueDate ? item.dueDate.slice(0, 10) : '')
    setEditorOpen(true)
  }

  const saveItem = async () => {
    if (!title.trim() || !classId) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/sunday-school/memorizations/${editing.id}` : '/api/sunday-school/memorizations', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, title, instructions, dueDate: dueDate || null }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save memorization')
      toast.success(editing ? 'Memorization updated' : 'Memorization added')
      if (!editing) setItemId(body.id)
      setEditorOpen(false)
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save memorization')
    } finally {
      setSaving(false)
    }
  }

  const archiveItem = async () => {
    if (!selected || !confirm('Archive this memorization? Its recorded scores are kept.')) return
    const res = await fetch(`/api/sunday-school/memorizations/${selected.id}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) return toast.error(body.error || 'Failed to archive memorization')
    toast.success('Memorization archived')
    setItemId('')
    await mutate()
  }

  const invalid = Object.values(drafts).some(draft => {
    if (draft.score.trim() === '') return false
    const value = Number(draft.score)
    return !Number.isInteger(value) || value < MEMORIZATION_MIN_SCORE || value > MEMORIZATION_MAX_SCORE
  })

  const saveScores = async () => {
    if (!selected || invalid) return
    setSaving(true)
    try {
      const res = await fetch(`/api/sunday-school/memorizations/${selected.id}/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: roster.map(child => {
            const draft = drafts[child.id] ?? { score: '', notes: '' }
            return { childId: child.id, score: draft.score.trim() === '' ? null : Number(draft.score), notes: draft.notes }
          }),
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to save scores')
      toast.success('Scores saved')
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save scores')
    } finally {
      setSaving(false)
    }
  }

  if (error) return <EmptyState message="Unable to load memorizations. Please refresh and try again." />

  if (status === 'loading' || isLoading || !session) return <PageLoading />

  const summary = selected
    ? summarizeMemorizationScores(selected.scores.filter(s => roster.some(c => c.id === s.childId)).map(s => s.score), roster.length)
    : null

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Memorization" meta={[selectedClass?.name, `Scored out of ${MEMORIZATION_MAX_SCORE}`]} />

      <Panel toolbar={
        <>
          {scopedClasses.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
              Class
              <FilterSelect aria-label="Class" value={classId} onChange={setClassId} options={scopedClasses.map(cls => ({ value: cls.id, label: cls.name }))} />
            </label>
          )}
          {memorizations.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
              Memorization
              <FilterSelect aria-label="Memorization" value={selected?.id ?? ''} onChange={setItemId} options={memorizations.map(item => ({ value: item.id, label: item.title }))} />
            </label>
          )}
          {canEdit && <Button size="sm" onClick={() => openEditor(null)}><Plus /> Add memorization</Button>}
        </>
      }>
        {!selected ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <BookOpenCheck className="size-8 text-ink-3" />
            <p className="font-medium text-ink">No memorizations yet</p>
            <p className="text-sm text-ink-3">{canEdit ? 'Add one for this class, then record each child’s score.' : 'Servants assigned to this class can add memorizations.'}</p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-medium text-ink">{selected.title}</h2>
                {selected.dueDate && <p className="text-xs text-ink-3">Due {formatDateUTC(selected.dueDate)}</p>}
                {selected.instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{selected.instructions}</p>}
              </div>
              {canEdit && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEditor(selected)}><Pencil /> Edit</Button><Button variant="ghost" size="sm" onClick={archiveItem}><Trash2 /> Archive</Button></div>}
            </div>
            {summary && <div className="flex flex-wrap gap-2 text-xs"><StatusBadge tone="ok">{summary.recorded} scored</StatusBadge><StatusBadge tone="neutral">{summary.notRecorded} not scored</StatusBadge>{summary.average !== null && <StatusBadge tone="neutral">Average {summary.average}/{MEMORIZATION_MAX_SCORE}</StatusBadge>}</div>}
          </div>
        )}
      </Panel>

      {selected && (
        <Panel title="Scores" description={`Whole numbers from ${MEMORIZATION_MIN_SCORE} to ${MEMORIZATION_MAX_SCORE}. Leave blank if not scored.`}>
          {roster.length === 0 ? <EmptyState message="No children are currently assigned to this class." /> : (
            <ul className="divide-y divide-line">
              {roster.map(child => {
                const draft = drafts[child.id] ?? { score: '', notes: '' }
                const name = `${child.firstName} ${child.lastName}`
                return (
                  <li key={child.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="flex items-center gap-2.5"><Initials name={name} size={32} /><span className="font-medium text-ink"><StudentName id={child.id} name={name} program="sunday-school" /></span></span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input aria-label={`Score for ${name}`} className="w-24" inputMode="numeric" placeholder={`/ ${MEMORIZATION_MAX_SCORE}`} disabled={!canEdit} value={draft.score} onChange={event => setDrafts(current => ({ ...current, [child.id]: { ...draft, score: event.target.value } }))} />
                      <Input aria-label={`Notes for ${name}`} className="w-56" maxLength={500} placeholder="Notes (optional)" disabled={!canEdit} value={draft.notes} onChange={event => setDrafts(current => ({ ...current, [child.id]: { ...draft, notes: event.target.value } }))} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {canEdit && roster.length > 0 && <div className="flex items-center justify-end gap-3 border-t border-line p-3">{invalid && <span className="text-xs text-bad">Scores must be whole numbers from {MEMORIZATION_MIN_SCORE} to {MEMORIZATION_MAX_SCORE}.</span>}<Button disabled={saving || invalid} onClick={saveScores}>{saving ? 'Saving…' : 'Save scores'}</Button></div>}
        </Panel>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? 'Edit memorization' : 'Add memorization'}</DialogTitle><DialogDescription>For {selectedClass?.name}. Children are scored out of {MEMORIZATION_MAX_SCORE}.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="memorization-title">Title</Label><Input id="memorization-title" maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Psalm 23" /></div>
            <div className="space-y-2"><Label htmlFor="memorization-instructions">Instructions (optional)</Label><Textarea id="memorization-instructions" maxLength={2000} value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="What should the children memorize?" /></div>
            <div className="space-y-2"><Label htmlFor="memorization-due">Date (optional)</Label><Input id="memorization-due" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={saving || !title.trim()} onClick={saveItem}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add memorization'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
