'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolAgeGroups, useSundaySchoolLessons } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { StatusBadge } from '@/components/ds/status-badge'
import { FilterSelect } from '@/components/ui/filter-select'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { SundaySchoolLessonImport } from '@/components/sunday-school-lesson-import'
import { sortClassesByAgeGroup } from '@/lib/sunday-school-class'
import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'
import { SundaySchoolLevel } from '@prisma/client'

interface ResourceDraft { title: string; url: string }

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function statusBadge(lesson: SundaySchoolWeeklyLesson) {
  if (lesson.status === 'READY') return <StatusBadge tone="ok">Ready</StatusBadge>
  if (lesson.status === 'NEEDS_LINKS') return <StatusBadge tone="warn">Needs links</StatusBadge>
  return <StatusBadge tone="neutral">Unassigned</StatusBadge>
}

export default function SundaySchoolLessonsPage() {
  const { session, status } = useSundaySchoolGuard()
  const lessonFilters = useMemo(() => ({ scope: 'year' as const }), [])
  const { data, error, isLoading, mutate } = useSundaySchoolLessons(lessonFilters)
  const { data: ageGroupsData } = useSundaySchoolAgeGroups()
  const lessons = ((data as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? [])
  const [scope, setScope] = useState<'schedule' | 'mine' | 'past'>('schedule')
  const [classId, setClassId] = useState('all')
  const [editing, setEditing] = useState<SundaySchoolWeeklyLesson | null>(null)
  const [title, setTitle] = useState('')
  const [resources, setResources] = useState<ResourceDraft[]>([])
  const [saving, setSaving] = useState(false)
  const today = dateOnly(new Date())

  const classOptions = sortClassesByAgeGroup(Array.from(
    new Map(lessons.map(lesson => [lesson.class.id, lesson.class])).values()
  ), (ageGroupsData as Array<{ levels: SundaySchoolLevel[]; name: string }> | undefined) ?? [])
  const manageableClasses = sortClassesByAgeGroup(Array.from(
    new Map(
      lessons
        .filter(lesson => lesson.canEdit)
        .map(lesson => [lesson.class.id, lesson.class])
    ).values()
  ), (ageGroupsData as Array<{ levels: SundaySchoolLevel[]; name: string }> | undefined) ?? [])

  const visibleLessons = lessons.filter(lesson => {
    if (classId !== 'all' && lesson.classId !== classId) return false
    if (scope === 'mine') return lesson.ownerId === session?.user?.id && lesson.sundayDate.slice(0, 10) >= today
    if (scope === 'past') return lesson.sundayDate.slice(0, 10) < today
    return true
  })

  const openEditor = (lesson: SundaySchoolWeeklyLesson) => {
    setEditing(lesson)
    setTitle(lesson.title ?? '')
    setResources(lesson.resources.map(resource => ({ title: resource.title, url: resource.url })))
  }

  const patchLesson = async (lessonId: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/sunday-school/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'Could not update the lesson')
    await mutate()
  }

  const assignOwner = async (lesson: SundaySchoolWeeklyLesson, ownerId: string) => {
    try {
      await patchLesson(lesson.id, { ownerId: ownerId || null })
      toast.success(ownerId ? 'Lesson owner assigned' : 'Lesson owner removed')
    } catch (assignmentError) {
      toast.error(assignmentError instanceof Error ? assignmentError.message : 'Could not assign the lesson')
    }
  }

  const saveLesson = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await patchLesson(editing.id, { title, resources })
      toast.success('Lesson links saved')
      setEditing(null)
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save the lesson')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading' || isLoading) return <PageLoading />

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Lessons"
          meta={['Assign each Sunday lesson and share the slides and resources your class needs']}
          actions={
            manageableClasses.length > 0 ? (
              <SundaySchoolLessonImport
                classes={manageableClasses}
                initialClassId={classId !== 'all' ? classId : undefined}
                onSuccess={async () => {
                  await mutate()
                }}
              />
            ) : undefined
          }
        />

        <Panel
          toolbar={
            <>
              <Segmented
                label="Lessons"
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'schedule', label: 'Year schedule' },
                  { value: 'mine', label: 'My lessons' },
                  { value: 'past', label: 'Past' },
                ]}
              />
              <FilterSelect
                aria-label="Filter lessons by class"
                value={classId}
                onChange={setClassId}
                className="md:ml-auto"
                options={[{ value: 'all', label: 'All classes' }, ...classOptions.map((cls) => ({ value: cls.id, label: cls.name }))]}
              />
            </>
          }
          footer={<span className="tabular">{visibleLessons.length} lessons</span>}
        >
          {error ? (
            <EmptyState title="Couldn’t load lessons" message="Something went wrong on our side. Try again in a moment." />
          ) : visibleLessons.length === 0 ? (
            <EmptyState
              message={
                scope === 'mine' ? 'You have no upcoming lessons assigned.' : scope === 'past' ? 'There are no past lessons yet.' : 'No lessons scheduled. Import a schedule to start.'
              }
            />
          ) : (
            <>
              <div className="hidden grid-cols-[7rem_minmax(12rem,1.05fr)_minmax(10rem,0.95fr)_auto] gap-4 border-b border-line bg-hover/30 px-4 py-2 text-xs font-medium text-ink-3 xl:grid">
                <span>Date</span>
                <span>Lesson</span>
                <span>Resources</span>
                <span className="text-right">Status and owner</span>
              </div>
              <ul className="divide-y divide-line" aria-label="Lesson schedule">
                {visibleLessons.map((lesson) => (
                  <li
                    key={lesson.id}
                    className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-hover/30 sm:grid-cols-[7rem_minmax(0,1fr)] xl:grid-cols-[7rem_minmax(12rem,1.05fr)_minmax(10rem,0.95fr)_auto] xl:items-center"
                  >
                    <span className="text-[13px] text-ink-2">
                      {formatDateUTC(lesson.sundayDate, { year: undefined })}
                      <span className="block text-xs text-ink-3 xl:hidden">{lesson.class.name}</span>
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className={`truncate text-[13.5px] font-medium ${lesson.title ? 'text-ink' : 'text-ink-3'}`}>{lesson.title || 'Not assigned'}</span>
                      <span className="truncate text-xs text-ink-3">
                        <span className="hidden xl:inline">{lesson.class.name} · </span>
                        {lesson.owner ? `Owner: ${lesson.owner.name}` : 'No owner yet'}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-col items-start gap-1.5 text-[13px] sm:col-start-2 xl:col-start-auto">
                      {lesson.resources.length === 0 ? (
                        <span className="text-ink-3">No links added yet.</span>
                      ) : (
                        lesson.resources.map((resource) => (
                          <a
                            key={resource.id}
                            href={resource.url}
                            target="_blank"
                            rel="noreferrer"
                            title={resource.title}
                            className="flex min-w-0 max-w-full items-center gap-1.5 text-accent-ink hover:underline"
                          >
                            <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                            <span className="truncate">{resource.title}</span>
                            <span className="sr-only">(opens in a new tab)</span>
                          </a>
                        ))
                      )}
                    </span>
                    <span className="flex min-w-0 flex-wrap items-center gap-2 sm:col-start-2 xl:col-start-auto xl:flex-nowrap xl:justify-end">
                      <span className="flex w-[7.25rem] shrink-0 items-center">{statusBadge(lesson)}</span>
                      {lesson.canAssignOwner && (
                        <select
                          aria-label={`Owner for ${lesson.class.name} on ${formatDateUTC(lesson.sundayDate)}`}
                          value={lesson.ownerId ?? ''}
                          onChange={(event) => assignOwner(lesson, event.target.value)}
                          className="h-11 w-44 shrink-0 rounded-md border border-line-strong bg-surface px-2 text-base text-ink md:h-8 md:text-[13px]"
                        >
                          <option value="">Unassigned</option>
                          {lesson.eligibleOwners.map((owner) => (
                            <option key={owner.id} value={owner.id}>
                              {owner.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {lesson.canEdit && (
                        <Button className="w-32 shrink-0 justify-center" variant="outline" size="sm" onClick={() => openEditor(lesson)}>
                          <Pencil />
                          Edit lesson
                        </Button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit lesson</DialogTitle>
            <DialogDescription>
              Add named Google Slides, PowerPoint, video, or other web links. Families see them immediately after you save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lesson-title">Lesson title</Label>
              <Input id="lesson-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="The Good Samaritan" />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Links</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setResources(current => [...current, { title: '', url: '' }])}>
                  <Plus className="mr-1 h-4 w-4" /> Add link
                </Button>
              </div>
              {resources.length === 0 ? (
                <div className="rounded-md border border-dashed border-line-strong p-4 text-center text-[13px] text-ink-3">
                  <Link2 className="mx-auto mb-2 h-5 w-5" /> No links added yet.
                </div>
              ) : resources.map((resource, index) => (
                <div key={index} className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-[1fr_1.5fr_auto]">
                  <Input aria-label={`Link ${index + 1} title`} value={resource.title} onChange={event => setResources(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} placeholder="Slides" />
                  <Input aria-label={`Link ${index + 1} URL`} value={resource.url} onChange={event => setResources(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} placeholder="https://…" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => setResources(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove link ${index + 1}`}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveLesson} disabled={saving}>{saving ? 'Saving…' : 'Save lesson'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
