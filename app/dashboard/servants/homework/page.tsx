'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, NotebookPen, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { useSundaySchoolHomework } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import type {
  SundaySchoolHomeworkDisplayStatus,
  SundaySchoolHomeworkResponse,
} from '@/types/sunday-school'

type LinkDraft = { title: string; url: string }

export default function SundaySchoolHomeworkPage() {
  const { session, status } = useSundaySchoolGuard()
  const [classId, setClassId] = useState('')
  const { data, isLoading, mutate } = useSundaySchoolHomework(classId || undefined, true)
  const homeworkData = data as SundaySchoolHomeworkResponse | undefined
  const [weekId, setWeekId] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [instructions, setInstructions] = useState('')
  const [links, setLinks] = useState<LinkDraft[]>([])
  const [saving, setSaving] = useState(false)
  const [marks, setMarks] = useState<Record<string, SundaySchoolHomeworkDisplayStatus>>({})

  const classes = useMemo(() => homeworkData?.classes ?? [], [homeworkData?.classes])
  const weeks = useMemo(
    () => (homeworkData?.weeks ?? []).filter(week => !classId || week.class.id === classId),
    [classId, homeworkData?.weeks]
  )
  const selectedWeek = weeks.find(week => week.weeklyLessonId === weekId) ?? null
  const selectedClass = classes.find(cls => cls.id === classId)

  useEffect(() => {
    if (!classId && classes.length > 0) setClassId(classes[0].id)
  }, [classId, classes])

  useEffect(() => {
    if (weeks.length === 0) {
      setWeekId('')
      return
    }
    if (weeks.some(week => week.weeklyLessonId === weekId)) return
    const today = new Date().toISOString().slice(0, 10)
    const mostRecent = weeks.find(week => week.assignedDate.slice(0, 10) <= today)
    setWeekId((mostRecent ?? weeks[weeks.length - 1]).weeklyLessonId)
  }, [weekId, weeks])

  useEffect(() => {
    const next: Record<string, SundaySchoolHomeworkDisplayStatus> = {}
    for (const child of homeworkData?.roster ?? []) next[child.id] = 'NOT_RECORDED'
    for (const completion of selectedWeek?.homework?.completions ?? []) next[completion.childId] = completion.status
    setMarks(next)
  }, [homeworkData?.roster, selectedWeek])

  const openEditor = () => {
    setTitle(selectedWeek?.homework?.title ?? '')
    setInstructions(selectedWeek?.homework?.instructions ?? '')
    setLinks(selectedWeek?.homework?.resources.map(resource => ({ title: resource.title, url: resource.url })) ?? [])
    setEditorOpen(true)
  }

  const saveHomework = async () => {
    if (!selectedWeek || !title.trim()) return
    setSaving(true)
    try {
      const existing = selectedWeek.homework
      const response = await fetch(existing ? `/api/sunday-school/homework/${existing.id}` : '/api/sunday-school/homework', {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weeklyLessonId: selectedWeek.weeklyLessonId,
          title,
          instructions,
          resources: links,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to save homework')
      toast.success(existing ? 'Homework updated' : 'Homework published')
      setEditorOpen(false)
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save homework')
    } finally {
      setSaving(false)
    }
  }

  const archiveHomework = async () => {
    if (!selectedWeek?.homework || !confirm('Archive this homework? Families will no longer see it, but its history will be kept.')) return
    const response = await fetch(`/api/sunday-school/homework/${selectedWeek.homework.id}`, { method: 'DELETE' })
    const body = await response.json()
    if (!response.ok) return toast.error(body.error || 'Failed to archive homework')
    toast.success('Homework archived')
    await mutate()
  }

  const saveMarks = async () => {
    if (!selectedWeek?.homework) return
    setSaving(true)
    try {
      const response = await fetch(`/api/sunday-school/homework/${selectedWeek.homework.id}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          records: (homeworkData?.roster ?? []).map(child => ({
            childId: child.id,
            status: marks[child.id] === 'NOT_RECORDED' ? null : marks[child.id],
          })),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Failed to save completion')
      toast.success('Homework completion saved')
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save completion')
    } finally {
      setSaving(false)
    }
  }

  const history = useMemo(() => {
    const children = new Map((homeworkData?.roster ?? []).map(child => [child.id, child]))
    for (const week of weeks) {
      for (const completion of week.homework?.completions ?? []) {
        if (!children.has(completion.childId)) children.set(completion.childId, completion.child)
      }
    }
    return Array.from(children.values()).map(child => {
    const statuses = weeks.flatMap(week => {
      const homework = week.homework
      if (!homework) return []
      return [homework.completions.find(completion => completion.childId === child.id)?.status ?? 'NOT_RECORDED']
    })
    const completed = statuses.filter(value => value === 'COMPLETED').length
    const notCompleted = statuses.filter(value => value === 'NOT_COMPLETED').length
    const recorded = completed + notCompleted
      return { ...child, completed, notCompleted, notRecorded: statuses.length - recorded, rate: recorded ? Math.round(completed / recorded * 100) : null }
    }).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
  }, [homeworkData?.roster, weeks])

  if (status === 'loading' || isLoading || !session) return <PageLoading />
  if (!homeworkData?.eligible) {
    return <Panel><EmptyState title="Elementary Homework" message="Homework is available only to servants assigned to an Elementary class." /></Panel>
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Homework" meta={['Publish Elementary homework and track completion through the school year']} />

      <Panel toolbar={
        <>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
            Class
            <FilterSelect aria-label="Class" value={classId} onChange={setClassId} options={classes.map(cls => ({ value: cls.id, label: cls.name }))} />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
            Assigned meeting
            <FilterSelect aria-label="Assigned meeting" value={weekId} onChange={setWeekId} options={weeks.map(week => ({ value: week.weeklyLessonId, label: formatDateUTC(week.assignedDate) }))} />
          </label>
        </>
      }>
        {!selectedWeek ? (
          <EmptyState message="No weekly lesson dates are available for this class." />
        ) : !selectedWeek.homework ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <NotebookPen className="size-8 text-ink-3" />
            <div><p className="font-medium text-ink">No homework assigned</p><p className="text-sm text-ink-3">Assigned {formatDateUTC(selectedWeek.assignedDate)} · due {formatDateUTC(selectedWeek.dueDate)}</p></div>
            {selectedClass?.canEdit && <Button onClick={openEditor}><Plus /> Publish homework</Button>}
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="font-display text-2xl font-medium text-ink">{selectedWeek.homework.title}</h2>
                  {selectedWeek.homework.archivedAt && <StatusBadge tone="neutral">Archived</StatusBadge>}
                </div>
                <p className="text-xs text-ink-3">Assigned {formatDateUTC(selectedWeek.assignedDate)} · due {formatDateUTC(selectedWeek.dueDate)}</p>
                {selectedWeek.homework.instructions && <p className="mt-3 whitespace-pre-wrap text-sm text-ink-2">{selectedWeek.homework.instructions}</p>}
              </div>
              {selectedClass?.canEdit && <div className="flex gap-2"><Button variant="outline" size="sm" onClick={openEditor}><Pencil /> Edit</Button><Button variant="ghost" size="sm" onClick={archiveHomework}><Trash2 /> Archive</Button></div>}
            </div>
            {selectedWeek.homework.resources.length > 0 && <div className="flex flex-wrap gap-2">{selectedWeek.homework.resources.map(resource => <Button key={resource.id} asChild variant="outline" size="sm"><a href={resource.url} target="_blank" rel="noreferrer"><ExternalLink /> {resource.title}</a></Button>)}</div>}
            <div className="flex flex-wrap gap-2 text-xs"><StatusBadge tone="ok">{selectedWeek.homework.summary.completed} completed</StatusBadge><StatusBadge tone="bad">{selectedWeek.homework.summary.notCompleted} not completed</StatusBadge><StatusBadge tone="neutral">{selectedWeek.homework.summary.notRecorded} not recorded</StatusBadge></div>
          </div>
        )}
      </Panel>

      {selectedWeek?.homework && <Panel title="Completion roster" description="Only assigned servants can change the official record">
        {(homeworkData.roster ?? []).length === 0 ? <EmptyState message="No children are currently assigned to this class." /> : <ul className="divide-y divide-line">{homeworkData.roster.map(child => <li key={child.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><span className="flex items-center gap-2.5"><Initials name={`${child.firstName} ${child.lastName}`} size={32} /><span className="font-medium text-ink">{child.firstName} {child.lastName}</span></span><div className="flex flex-wrap items-center gap-1"><Button size="sm" variant={marks[child.id] === 'COMPLETED' ? 'default' : 'outline'} disabled={!selectedClass?.canEdit} onClick={() => setMarks(current => ({ ...current, [child.id]: 'COMPLETED' }))}>Completed</Button><Button size="sm" variant={marks[child.id] === 'NOT_COMPLETED' ? 'destructive' : 'outline'} disabled={!selectedClass?.canEdit} onClick={() => setMarks(current => ({ ...current, [child.id]: 'NOT_COMPLETED' }))}>Not completed</Button><Button size="sm" variant="ghost" disabled={!selectedClass?.canEdit} onClick={() => setMarks(current => ({ ...current, [child.id]: 'NOT_RECORDED' }))}>Clear</Button></div></li>)}</ul>}
        {selectedClass?.canEdit && homeworkData.roster.length > 0 && <div className="flex justify-end border-t border-line p-3"><Button disabled={saving} onClick={saveMarks}>{saving ? 'Saving…' : 'Save completion'}</Button></div>}
      </Panel>}

      <Panel title="School-year history" description="Completion rate excludes weeks that have not been recorded">
        {history.length === 0 ? <EmptyState message="No children are currently assigned to this class." /> : <ul className="divide-y divide-line">{history.map(child => <li key={child.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-medium text-ink">{child.firstName} {child.lastName}</span><span className="flex flex-wrap items-center justify-end gap-2 text-xs text-ink-3"><span>{child.completed} completed</span><span>· {child.notCompleted} not completed</span><span>· {child.notRecorded} not recorded</span><strong className="text-ink">{child.rate === null ? '—' : `${child.rate}%`}</strong></span></li>)}</ul>}
      </Panel>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{selectedWeek?.homework ? 'Edit homework' : 'Publish homework'}</DialogTitle><DialogDescription>Families will see this homework in their existing dashboard. Add links to documents, videos, or other resources.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="homework-title">Title</Label><Input id="homework-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="Memory verse and worksheet" /></div>
            <div className="space-y-2"><Label htmlFor="homework-instructions">Instructions</Label><Textarea id="homework-instructions" value={instructions} onChange={event => setInstructions(event.target.value)} placeholder="What should the children complete before next week?" /></div>
            <div className="space-y-3"><div className="flex items-center justify-between"><Label>Links</Label><Button type="button" variant="outline" size="sm" onClick={() => setLinks(current => [...current, { title: '', url: '' }])}><Plus /> Add link</Button></div>{links.map((link, index) => <div key={index} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1.5fr_auto]"><Input aria-label={`Link ${index + 1} title`} value={link.title} onChange={event => setLinks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Worksheet" /><Input aria-label={`Link ${index + 1} URL`} value={link.url} onChange={event => setLinks(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://…" /><Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${index + 1}`} onClick={() => setLinks(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></div>)}</div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={saving || !title.trim()} onClick={saveHomework}>{saving ? 'Saving…' : selectedWeek?.homework ? 'Save changes' : 'Publish homework'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
