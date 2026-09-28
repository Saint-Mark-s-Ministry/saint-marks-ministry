'use client'

import { useMemo, useState } from 'react'
import { ExternalLink, Link2, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolLessons } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { SundaySchoolLessonImport } from '@/components/sunday-school-lesson-import'
import type { SundaySchoolWeeklyLesson, SundaySchoolWeeklyLessonsResponse } from '@/types/sunday-school'

interface ResourceDraft { title: string; url: string }

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function statusBadge(lesson: SundaySchoolWeeklyLesson) {
  if (lesson.status === 'READY') return <Badge className="bg-green-600">Ready</Badge>
  if (lesson.status === 'NEEDS_LINKS') return <Badge variant="outline" className="border-amber-500 text-amber-700">Needs links</Badge>
  return <Badge variant="secondary">Unassigned</Badge>
}

export default function SundaySchoolLessonsPage() {
  const { session, status } = useSundaySchoolGuard()
  const lessonFilters = useMemo(() => ({ scope: 'year' as const }), [])
  const { data, error, isLoading, mutate } = useSundaySchoolLessons(lessonFilters)
  const lessons = ((data as SundaySchoolWeeklyLessonsResponse | undefined)?.lessons ?? [])
  const [scope, setScope] = useState<'schedule' | 'mine' | 'past'>('schedule')
  const [classId, setClassId] = useState('all')
  const [editing, setEditing] = useState<SundaySchoolWeeklyLesson | null>(null)
  const [title, setTitle] = useState('')
  const [resources, setResources] = useState<ResourceDraft[]>([])
  const [saving, setSaving] = useState(false)
  const today = dateOnly(new Date())

  const classOptions = Array.from(
    new Map(lessons.map(lesson => [lesson.class.id, lesson.class])).values()
  ).sort((a, b) => a.name.localeCompare(b.name))
  const manageableClasses = Array.from(
    new Map(
      lessons
        .filter(lesson => lesson.canEdit)
        .map(lesson => [lesson.class.id, { id: lesson.class.id, name: lesson.class.name }])
    ).values()
  ).sort((a, b) => a.name.localeCompare(b.name))

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Lessons"
          description="Assign each Sunday lesson and share the slides and resources your class needs."
          actions={manageableClasses.length > 0 ? (
            <SundaySchoolLessonImport
              classes={manageableClasses}
              initialClassId={classId !== 'all' ? classId : undefined}
              onSuccess={async () => { await mutate() }}
            />
          ) : undefined}
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {([
              ['schedule', 'Year schedule'],
              ['mine', 'My lessons'],
              ['past', 'Past lessons'],
            ] as const).map(([value, label]) => (
              <Button key={value} variant={scope === value ? 'default' : 'outline'} onClick={() => setScope(value)}>
                {label}
              </Button>
            ))}
          </div>
          <select
            aria-label="Filter lessons by class"
            value={classId}
            onChange={event => setClassId(event.target.value)}
            className="h-9 rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">All classes</option>
            {classOptions.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </select>
        </div>

        {error ? (
          <Card><CardContent className="pt-6"><EmptyState message="Lessons could not be loaded." /></CardContent></Card>
        ) : visibleLessons.length === 0 ? (
          <Card><CardContent className="pt-6"><EmptyState message={scope === 'mine' ? 'You have no upcoming lessons assigned.' : scope === 'past' ? 'There are no past lessons yet.' : 'No lessons are available for the active academic year.'} /></CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {visibleLessons.map(lesson => (
              <Card key={lesson.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{lesson.class.name}</CardTitle>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{formatDateUTC(lesson.sundayDate)}</p>
                    </div>
                    {statusBadge(lesson)}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="font-medium">{lesson.title || 'Lesson title not added'}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {lesson.owner ? `Owner: ${lesson.owner.name}` : 'No lesson owner assigned yet.'}
                    </p>
                  </div>

                  {lesson.resources.length > 0 && (
                    <div className="space-y-2">
                      {lesson.resources.map(resource => (
                        <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-maroon-700 hover:underline dark:text-maroon-300">
                          <ExternalLink className="h-4 w-4 shrink-0" />
                          {resource.title}
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center dark:border-gray-800">
                    {lesson.canAssignOwner && (
                      <select
                        aria-label={`Owner for ${lesson.class.name} on ${formatDateUTC(lesson.sundayDate)}`}
                        value={lesson.ownerId ?? ''}
                        onChange={event => assignOwner(lesson, event.target.value)}
                        className="h-9 flex-1 rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                      >
                        <option value="">Unassigned</option>
                        {lesson.eligibleOwners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                      </select>
                    )}
                    {lesson.canEdit && (
                      <Button variant="outline" onClick={() => openEditor(lesson)}>
                        <Pencil className="mr-1 h-4 w-4" /> Edit lesson
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
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
                <div className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-500">
                  <Link2 className="mx-auto mb-2 h-5 w-5" /> No links added yet.
                </div>
              ) : resources.map((resource, index) => (
                <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1.5fr_auto] dark:border-gray-700">
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
