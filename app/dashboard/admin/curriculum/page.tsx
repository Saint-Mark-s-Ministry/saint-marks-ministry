'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { canManageCurriculum } from '@/lib/roles'
import { toast } from 'sonner'
import { formatToastTimestamp } from '@/lib/utils'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { PageLoading } from '@/components/ui/page-loading'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import styles from '@/components/curriculum/schedule.module.css'
import { SortableRow } from '@/components/curriculum/sortable-row'
import { MobileLessonCard } from '@/components/curriculum/mobile-lesson-card'
import type { Lesson, Section, LessonEdits } from '@/components/curriculum/types'
import type { AcademicYear } from '@/lib/types'

export default function CurriculumPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSection, setFilterSection] = useState<string>('all')
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Track edited fields per lesson
  const [editedLessons, setEditedLessons] = useState<Map<string, LessonEdits>>(new Map())
  const hasUnsavedChanges = editedLessons.size > 0

  // Add lesson form
  const [showAddRow, setShowAddRow] = useState(false)
  const [newLesson, setNewLesson] = useState({
    title: '',
    speaker: '',
    scheduledDate: '',
    examSectionId: '',
    isExamDay: false,
    subtitle: '',
    description: '',
  })
  const [formAcademicYearId, setFormAcademicYearId] = useState<string>('')

  // Refs for event handlers that need access to latest state
  const hasUnsavedRef = useRef(false)
  hasUnsavedRef.current = hasUnsavedChanges
  const saveRef = useRef<() => void>(() => {})

  // Warn about unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (hasUnsavedRef.current) {
          saveRef.current()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // DnD sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  // Fetch academic years and sections on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const yearsRes = await fetch('/api/academic-years')
        if (!yearsRes.ok) throw new Error('Failed to fetch years')
        const years = await yearsRes.json()
        const yearsArray = Array.isArray(years) ? years : []
        setAcademicYears(yearsArray)

        const activeYear = yearsArray.find((y: AcademicYear) => y.isActive)
        if (activeYear) {
          setSelectedYearId('all')
          setFormAcademicYearId(activeYear.id)
        }

        const sectionsRes = await fetch('/api/exam-sections')
        if (sectionsRes.ok) {
          const sectionsData = await sectionsRes.json()
          setSections(Array.isArray(sectionsData) ? sectionsData : [])
          if (sectionsData.length > 0) {
            setNewLesson(prev => ({ ...prev, examSectionId: sectionsData[0].id }))
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error)
      }
    }

    if (session?.user) {
      fetchInitialData()
    }
  }, [session])

  // Fetch lessons when selected year changes
  useEffect(() => {
    const fetchLessons = async () => {
      if (!selectedYearId) return

      setLoading(true)
      try {
        const url = selectedYearId && selectedYearId !== 'all'
          ? `/api/lessons?academicYearId=${selectedYearId}`
          : '/api/lessons'

        const lessonsRes = await fetch(url)
        if (!lessonsRes.ok) {
          const errorData = await lessonsRes.json()
          throw new Error(errorData.error || 'Failed to fetch lessons')
        }
        const lessonsData = await lessonsRes.json()
        setLessons(Array.isArray(lessonsData) ? lessonsData : [])
        setEditedLessons(new Map())
      } catch (error) {
        console.error('Failed to fetch lessons:', error)
        setLessons([])
      } finally {
        setLoading(false)
      }
    }

    if (session?.user && selectedYearId) {
      fetchLessons()
    }
  }, [session, selectedYearId])

  const handleEdit = useCallback((id: string, field: keyof LessonEdits, value: string | boolean) => {
    setEditedLessons(prev => {
      const next = new Map(prev)
      const existing = next.get(id) || {}
      next.set(id, { ...existing, [field]: value })
      return next
    })
  }, [])

  const handleEditResources = useCallback((id: string, resources: { title: string; url: string }[]) => {
    setEditedLessons(prev => {
      const next = new Map(prev)
      const existing = next.get(id) || {}
      next.set(id, { ...existing, resources })
      return next
    })
  }, [])

  const handleDuplicate = async (lessonId: string) => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: new Date().toISOString() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to duplicate lesson')
      }

      const duplicated = await res.json()
      setLessons(prev => [...prev, duplicated])
      toast.success('Lesson duplicated', {
        description: `"${duplicated.title}" created`,
      })
    } catch (error) {
      console.error('Failed to duplicate lesson:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to duplicate lesson')
    }
  }

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const fetchLessonsUrl = () =>
    selectedYearId && selectedYearId !== 'all'
      ? `/api/lessons?academicYearId=${selectedYearId}`
      : '/api/lessons'

  const refetchLessons = async () => {
    const lessonsRes = await fetch(fetchLessonsUrl())
    if (lessonsRes.ok) {
      const lessonsData = await lessonsRes.json()
      setLessons(Array.isArray(lessonsData) ? lessonsData : [])
    }
  }

  const handleSaveAll = async () => {
    if (editedLessons.size === 0) return
    setSaving(true)

    try {
      const updates = Array.from(editedLessons.entries()).map(([id, edits]) => ({
        id,
        ...edits,
      }))

      const res = await fetch('/api/lessons/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessons: updates }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      await refetchLessons()
      setEditedLessons(new Map())
      const now = new Date()
      setLastSaved(now)
      toast.success(`Saved ${updates.length} lesson${updates.length > 1 ? 's' : ''}`, {
        description: formatToastTimestamp(now),
      })
    } catch (error) {
      console.error('Failed to save:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = handleSaveAll

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentFiltered = lessons
      .filter(lesson => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase()
          if (!lesson.title.toLowerCase().includes(term) &&
              !(lesson.speaker || '').toLowerCase().includes(term) &&
              !(lesson.description || '').toLowerCase().includes(term)) return false
        }
        if (filterSection !== 'all' && lesson.examSection.name !== filterSection) return false
        return true
      })
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

    const oldIndex = currentFiltered.findIndex(l => l.id === active.id)
    const newIndex = currentFiltered.findIndex(l => l.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reorderedFiltered = arrayMove(currentFiltered, oldIndex, newIndex)

    setReordering(true)
    try {
      const res = await fetch('/api/lessons/batch/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The API assigns newest-first date slots; the table displays oldest first.
        body: JSON.stringify({ lessonIds: [...reorderedFiltered].reverse().map(l => l.id) }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reorder')
      }

      await refetchLessons()
      toast.success('Lessons reordered')
    } catch (error) {
      console.error('Failed to reorder:', error)
      toast.error('Failed to reorder lessons')
      await refetchLessons()
    } finally {
      setReordering(false)
    }
  }

  const handleAddLesson = async () => {
    if (!newLesson.title || !newLesson.scheduledDate || !formAcademicYearId) {
      toast.error('Title and date are required')
      return
    }

    try {
      const res = await fetch('/api/lessons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLesson.title,
          speaker: newLesson.speaker || null,
          subtitle: newLesson.subtitle || null,
          description: newLesson.description || null,
          scheduledDate: new Date(newLesson.scheduledDate).toISOString(),
          examSectionId: newLesson.examSectionId,
          academicYearId: formAcademicYearId,
          isExamDay: newLesson.isExamDay,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lesson')
      }

      const created = await res.json()
      setLessons(prev => [...prev, created])
      setShowAddRow(false)
      setNewLesson({
        title: '',
        speaker: '',
        scheduledDate: '',
        examSectionId: sections[0]?.id || '',
        isExamDay: false,
        subtitle: '',
        description: '',
      })
      const now = new Date()
      setLastSaved(now)
      toast.success('Lesson created', {
        description: formatToastTimestamp(now),
      })
    } catch (error) {
      console.error('Failed to create lesson:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create lesson')
    }
  }

  // Reset attendance for a lesson
  const handleResetAttendance = async (lessonId: string) => {
    if (!confirm('Reset all attendance records for this lesson? This will permanently delete all attendance data and set the status back to Scheduled.')) return

    try {
      const res = await fetch(`/api/lessons/${lessonId}/reset-attendance`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reset attendance')
      }
      setLessons(prev => prev.map(l =>
        l.id === lessonId
          ? { ...l, status: 'SCHEDULED', _count: { attendanceRecords: 0 } }
          : l
      ))
      toast.success('Attendance reset', { description: 'All records deleted — lesson set to Scheduled' })
    } catch (error) {
      console.error('Failed to reset attendance:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to reset attendance')
    }
  }

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Are you sure you want to delete this lesson?')) return

    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')

      setLessons(prev => prev.filter(l => l.id !== lessonId))
      setEditedLessons(prev => {
        const next = new Map(prev)
        next.delete(lessonId)
        return next
      })
      toast.success('Lesson deleted')
    } catch (error) {
      console.error('Failed to delete lesson:', error)
      toast.error('Failed to delete lesson')
    }
  }

  const handleDiscardChanges = () => {
    if (editedLessons.size > 0 && confirm('Discard all unsaved changes?')) {
      setEditedLessons(new Map())
    }
  }

  const handleMobileMove = async (lessonId: string, direction: 'up' | 'down') => {
    const idx = filteredLessons.findIndex(l => l.id === lessonId)
    if (idx === -1) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= filteredLessons.length) return

    const reordered = [...filteredLessons]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    setReordering(true)
    try {
      const res = await fetch('/api/lessons/batch/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonIds: [...reordered].reverse().map(l => l.id) }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to reorder')
      }

      await refetchLessons()
      toast.success('Lesson moved')
    } catch (error) {
      console.error('Failed to move lesson:', error)
      toast.error('Failed to move lesson')
    } finally {
      setReordering(false)
    }
  }

  const filtersActive = searchTerm !== '' || filterSection !== 'all'

  const filteredLessons = lessons
    .filter(lesson => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        const matchTitle = lesson.title.toLowerCase().includes(term)
        const matchSpeaker = (lesson.speaker || '').toLowerCase().includes(term)
        const matchDesc = (lesson.description || '').toLowerCase().includes(term)
        if (!matchTitle && !matchSpeaker && !matchDesc) return false
      }
      if (filterSection !== 'all' && lesson.examSection.name !== filterSection) {
        return false
      }
      return true
    })
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  const canEdit = session?.user?.role && canManageCurriculum(session.user.role)

  const completed = lessons.filter((l) => l.status === 'COMPLETED').length
  const yearName = selectedYearId === 'all' ? 'All years' : academicYears.find((y) => y.id === selectedYearId)?.name.replace('-', '–')
  const field = (label: string, control: React.ReactNode, id?: string, required = false) => (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-bad"> *</span>}
      </Label>
      {control}
    </div>
  )

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Curriculum"
        meta={[
          yearName,
          `${lessons.length} lessons`,
          `${completed} completed`,
          lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null,
        ]}
        actions={
          canEdit && (
            <Button onClick={() => setShowAddRow(true)}>
              <Plus />
              Add lesson
            </Button>
          )
        }
      />

      <Panel
        className="relative"
        toolbar={
          <>
            <FilterSelect
              aria-label="Academic year"
              value={selectedYearId}
              onChange={setSelectedYearId}
              options={[
                { value: 'all', label: 'All academic years' },
                ...academicYears.map((year) => ({ value: year.id, label: `${year.name.replace('-', '–')}${year.isActive ? ' (active)' : ''}` })),
              ]}
            />
            <FilterSelect
              aria-label="Section"
              value={filterSection}
              onChange={setFilterSection}
              options={[{ value: 'all', label: 'All sections' }, ...sections.map((section) => ({ value: section.name, label: section.displayName }))]}
            />
            <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search topics, speakers" className="md:ml-auto md:w-[240px]" />
          </>
        }
        footer={
          <span>
            {filteredLessons.length} lessons
            {canEdit && (filtersActive ? ' · clear filters to reorder' : ' · drag rows to reorder')}
          </span>
        }
      >
        {reordering && (
          <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
            <span className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              Reordering…
            </span>
          </div>
        )}

        {filteredLessons.length === 0 ? (
          <EmptyState message={canEdit ? 'No lessons match. Add one, or clear the filters.' : 'No lessons match these filters.'} />
        ) : (
          <>
            <div className={`hidden md:block ${styles.scrollArea}`}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} autoScroll={false}>
                <table className={styles.schedule}>
                  <colgroup>
                    {canEdit && <col style={{ width: 28 }} />}
                    <col style={{ width: 48 }} />
                    <col style={{ width: 132 }} />
                    <col style={{ width: 180 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 170 }} />
                    <col style={{ width: 210 }} />
                    <col style={{ width: canEdit ? 116 : 40 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {canEdit && <th scope="col"><span className="sr-only">Reorder</span></th>}
                      <th scope="col">Meeting<br />No.</th>
                      <th scope="col">Date</th>
                      <th scope="col">Block</th>
                      <th scope="col">Topic</th>
                      <th scope="col">Status</th>
                      <th scope="col">Speaker</th>
                      <th scope="col">Notes</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <SortableContext items={filteredLessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {filteredLessons.map((lesson, index) => (
                        <SortableRow
                          key={lesson.id}
                          lesson={lesson}
                          index={index}
                          canEdit={!!canEdit}
                          canDrag={!!canEdit && !filtersActive}
                          sections={sections}
                          edits={editedLessons.get(lesson.id)}
                          onEdit={handleEdit}
                          onEditResources={handleEditResources}
                          onDelete={handleDelete}
                          onDuplicate={handleDuplicate}
                          onResetAttendance={handleResetAttendance}
                          onToggleExpand={handleToggleExpand}
                          isExpanded={expandedIds.has(lesson.id)}
                        />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </DndContext>
            </div>

            <div className="flex flex-col gap-3 p-3 md:hidden">
              {filteredLessons.map((lesson, index) => (
                <MobileLessonCard
                  key={lesson.id}
                  lesson={lesson}
                  index={index}
                  totalCount={filteredLessons.length}
                  canEdit={!!canEdit}
                  canReorder={!filtersActive}
                  isReordering={reordering}
                  sections={sections}
                  edits={editedLessons.get(lesson.id)}
                  onEdit={handleEdit}
                  onEditResources={handleEditResources}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onResetAttendance={handleResetAttendance}
                  onMoveUp={(id) => handleMobileMove(id, 'up')}
                  onMoveDown={(id) => handleMobileMove(id, 'down')}
                  isExpanded={expandedIds.has(lesson.id)}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          </>
        )}
      </Panel>

      {canEdit && hasUnsavedChanges && (
        <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
          <StatusBadge tone="warn">
            {editedLessons.size} unsaved change{editedLessons.size > 1 ? 's' : ''}
          </StatusBadge>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={handleDiscardChanges}>Discard</Button>
            <Button onClick={handleSaveAll} disabled={saving}>{saving ? 'Saving…' : 'Save all changes'}</Button>
          </div>
        </div>
      )}

      <Dialog open={!!canEdit && showAddRow} onOpenChange={setShowAddRow}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add lesson</DialogTitle>
            <DialogDescription>It appears in the schedule and attendance right away.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            {field('Topic', <Input id="new-title" placeholder="Topic title" value={newLesson.title} onChange={(e) => setNewLesson((prev) => ({ ...prev, title: e.target.value }))} />, 'new-title', true)}
            {field('Subtitle', <Input id="new-subtitle" placeholder="Optional" value={newLesson.subtitle} onChange={(e) => setNewLesson((prev) => ({ ...prev, subtitle: e.target.value }))} />, 'new-subtitle')}
            <div className="grid grid-cols-2 gap-3">
              {field('Date', <Input id="new-date" type="date" value={newLesson.scheduledDate} onChange={(e) => setNewLesson((prev) => ({ ...prev, scheduledDate: e.target.value }))} />, 'new-date', true)}
              {field('Speaker', <Input id="new-speaker" placeholder="Speaker name" value={newLesson.speaker} onChange={(e) => setNewLesson((prev) => ({ ...prev, speaker: e.target.value }))} />, 'new-speaker')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field('Section', (
                <FilterSelect
                  aria-label="Section"
                  className="w-full md:h-9"
                  value={newLesson.examSectionId}
                  onChange={(v) => setNewLesson((prev) => ({ ...prev, examSectionId: v }))}
                  options={sections.map((section) => ({ value: section.id, label: section.displayName }))}
                />
              ))}
              {field('Academic year', (
                <FilterSelect
                  aria-label="Academic year"
                  className="w-full md:h-9"
                  value={formAcademicYearId}
                  onChange={setFormAcademicYearId}
                  options={academicYears.map((year) => ({ value: year.id, label: `${year.name.replace('-', '–')}${year.isActive ? ' (active)' : ''}` }))}
                />
              ))}
            </div>
            {field('Description', <Textarea id="new-description" rows={3} value={newLesson.description} onChange={(e) => setNewLesson((prev) => ({ ...prev, description: e.target.value }))} />, 'new-description')}
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={newLesson.isExamDay}
                onChange={(e) => setNewLesson((prev) => ({ ...prev, isExamDay: e.target.checked }))}
                className="size-4 accent-brand"
              />
              Exam day — not counted as a lesson
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRow(false)}>Cancel</Button>
            <Button onClick={handleAddLesson}>Create lesson</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
