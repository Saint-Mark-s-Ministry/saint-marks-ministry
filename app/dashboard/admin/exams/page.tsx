'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { refreshMakeupExamScores } from '@/lib/swr'
import { MakeupExamScores } from '@/components/makeup-exam-scores'
import { MakeupExamBookings } from '@/components/makeup-exam-bookings'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin, canManageExams } from "@/lib/roles"
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { Metric } from '@/components/ds/metric'
import { PersonCell } from '@/components/ds/person'
import { PageLoading } from '@/components/ui/page-loading'
import { toast } from 'sonner'
import { ChevronLeft, PencilLine, Plus, Trash2 } from 'lucide-react'
import { formatDateUTC, formatToastTimestamp, buildStudentMapFromEnrollments } from '@/lib/utils'

const YEAR_LABEL: Record<string, string> = { BOTH: 'Both years', YEAR_1: 'Year 1', YEAR_2: 'Year 2' }
import type { AcademicYear, ExamSection } from '@/lib/types'

interface Exam {
  id: string
  examDate: string
  yearLevel: string
  totalPoints: number
  examSection: ExamSection
  _count: {
    scores: number
  }
}

interface Student {
  id: string
  name: string
  email: string
  enrollments: Array<{
    yearLevel: string
    mentorId: string | null
  }>
}

interface ExamScore {
  id: string
  score: number
  percentage: number
  originalScore: number | null
  originalPercentage: number | null
  notes?: string
  student: {
    id: string
    name: string
  }
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ExamsPageContent />
    </Suspense>
  )
}

function ExamsPageContent() {
  const { session, status } = useAdminGuard(isAdmin)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [exams, setExams] = useState<Exam[]>([])
  const [examSections, setExamSections] = useState<ExamSection[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [selectedSectionId, setSelectedSectionId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [showCreateExam, setShowCreateExam] = useState(false)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [existingScores, setExistingScores] = useState<Map<string, ExamScore>>(new Map())
  const [scores, setScores] = useState<Map<string, number>>(new Map())
  const [notes, setNotes] = useState<Map<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMentees, setFilterMentees] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // New exam form
  const [newExam, setNewExam] = useState({
    examSectionId: '',
    yearLevel: 'BOTH' as 'YEAR_1' | 'YEAR_2' | 'BOTH',
    examDate: '',
    totalPoints: 100
  })

  // Read URL params for section filter
  useEffect(() => {
    const sectionParam = searchParams.get('section')
    if (sectionParam) {
      setSelectedSectionId(sectionParam)
    }
  }, [searchParams])

  // Fetch academic years, sections, and enrollments on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [yearsRes, sectionsRes, enrollmentsRes] = await Promise.all([
          fetch('/api/academic-years'),
          fetch('/api/exam-sections'),
          fetch('/api/enrollments')
        ])

        if (!yearsRes.ok) throw new Error('Failed to fetch years')
        if (!sectionsRes.ok) throw new Error('Failed to fetch sections')
        if (!enrollmentsRes.ok) throw new Error('Failed to fetch enrollments')

        const [yearsData, sectionsData, enrollmentsData] = await Promise.all([
          yearsRes.json(),
          sectionsRes.json(),
          enrollmentsRes.json()
        ])

        const years = Array.isArray(yearsData) ? yearsData : []
        setAcademicYears(years)
        setExamSections(Array.isArray(sectionsData) ? sectionsData : [])

        // Default to "all" to show all exams
        setSelectedYearId('all')

        // Build student map from enrollments
        setStudents(buildStudentMapFromEnrollments(enrollmentsData) as unknown as Student[])
      } catch (error) {
        console.error('Failed to fetch initial data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (session?.user) {
      fetchInitialData()
    }
  }, [session])

  // Fetch exams when selected year changes
  useEffect(() => {
    const fetchExams = async () => {
      try {
        // If "all" is selected or no year selected, fetch all exams
        const url = selectedYearId && selectedYearId !== 'all'
          ? `/api/exams?academicYearId=${selectedYearId}`
          : '/api/exams'
        const examsRes = await fetch(url)
        if (!examsRes.ok) throw new Error('Failed to fetch exams')
        const examsData = await examsRes.json()
        setExams(Array.isArray(examsData) ? examsData : [])
      } catch (error) {
        console.error('Failed to fetch exams:', error)
        setExams([])
      }
    }

    fetchExams()
  }, [selectedYearId])

  const createExam = async () => {
    try {
      // When creating, use the selected year or default to active year
      let yearIdForCreate = selectedYearId
      if (!selectedYearId || selectedYearId === 'all') {
        const activeYear = academicYears.find(y => y.isActive)
        if (!activeYear) {
          toast.error('No active academic year found. Please select a year.')
          return
        }
        yearIdForCreate = activeYear.id
      }

      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          academicYearId: yearIdForCreate,
          ...newExam
        })
      })

      if (res.ok) {
        const exam = await res.json()
        setExams([exam, ...exams])
        setShowCreateExam(false)
        setNewExam({
          examSectionId: '',
          yearLevel: 'BOTH',
          examDate: '',
          totalPoints: 100
        })
        const now = new Date()
        setLastSaved(now)
        toast.success('Exam created successfully!', {
          description: formatToastTimestamp(now)
        })
      } else {
        toast.error('Failed to create exam')
      }
    } catch (error) {
      console.error('Failed to create exam:', error)
      toast.error('Failed to create exam')
    }
  }

  const openEnterScores = async (exam: Exam) => {
    setSelectedExam(exam)
    setSearchTerm('')
    setFilterMentees(false)

    try {
      const res = await fetch(`/api/exams/${exam.id}/scores`)
      if (!res.ok) throw new Error('Unable to load exam scores.')
      const scoresData = await res.json()

      const scoresMap = new Map()
      const enteredScoresMap = new Map()
      const notesMap = new Map()

      scoresData.forEach((score: ExamScore) => {
        scoresMap.set(score.student.id, score)
        if (score.originalScore !== null) enteredScoresMap.set(score.student.id, score.originalScore)
        if (score.notes) {
          notesMap.set(score.student.id, score.notes)
        }
      })

      setExistingScores(scoresMap)
      setScores(enteredScoresMap)
      setNotes(notesMap)
    } catch (error) {
      console.error('Failed to fetch scores:', error)
    }
  }

  const handleScoreChange = (studentId: string, value: string) => {
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= (selectedExam?.totalPoints || 100)) {
      setScores(prev => {
        const newMap = new Map(prev)
        newMap.set(studentId, numValue)
        return newMap
      })
    } else if (value === '') {
      setScores(prev => {
        const newMap = new Map(prev)
        newMap.delete(studentId)
        return newMap
      })
    }
  }

  const handleNotesChange = (studentId: string, value: string) => {
    setNotes(prev => {
      const newMap = new Map(prev)
      if (value.trim()) {
        newMap.set(studentId, value)
      } else {
        newMap.delete(studentId)
      }
      return newMap
    })
  }

  const saveScores = async () => {
    if (!selectedExam) return

    setSaving(true)
    try {
      // Batch all score updates/creates in parallel
      const scorePromises = Array.from(scores.entries()).map(([studentId, score]) => {
        const existingScore = existingScores.get(studentId)
        const studentNotes = notes.get(studentId) || null

        if (existingScore) {
          return fetch(`/api/exam-scores/${existingScore.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ score, notes: studentNotes })
          })
        } else {
          return fetch(`/api/exams/${selectedExam.id}/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, score, notes: studentNotes })
          })
        }
      })

      const responses = await Promise.all(scorePromises)
      const failed = responses.find(response => !response.ok)
      if (failed) {
        const result = await failed.json().catch(() => ({}))
        throw new Error(result.error || 'Unable to save exam scores.')
      }

      const now = new Date()
      setLastSaved(now)
      toast.success('Scores saved successfully!', {
        description: formatToastTimestamp(now)
      })

      // Refresh all score state from the server to ensure consistency
      const scoresRes = await fetch(`/api/exams/${selectedExam.id}/scores`)
      const scoresData = await scoresRes.json()

      const existingScoresMap = new Map()
      const enteredScoresMap = new Map()
      const notesMap = new Map()

      scoresData.forEach((score: ExamScore) => {
        existingScoresMap.set(score.student.id, score)
        if (score.originalScore !== null) enteredScoresMap.set(score.student.id, score.originalScore)
        if (score.notes) {
          notesMap.set(score.student.id, score.notes)
        }
      })

      setExistingScores(existingScoresMap)
      setScores(enteredScoresMap)
      setNotes(notesMap)
      await refreshMakeupExamScores(selectedExam.id)

      // Update exam count locally without full refetch
      setExams(exams.map(exam =>
        exam.id === selectedExam.id
          ? { ...exam, _count: { scores: scoresData.length } }
          : exam
      ))
    } catch (error) {
      console.error('Failed to save scores:', error)
      toast.error('Failed to save scores')
    } finally {
      setSaving(false)
    }
  }

  const deleteExam = async (examId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening the exam for scoring

    if (!confirm('Are you sure you want to delete this exam? This will also delete all associated scores.')) {
      return
    }

    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const error = await res.json()
        toast.error(error.error || 'Failed to delete exam')
        return
      }

      toast.success('Exam deleted successfully!')

      // Remove the deleted exam from state
      setExams(exams.filter(exam => exam.id !== examId))
    } catch (error) {
      console.error('Failed to delete exam:', error)
      toast.error('Failed to delete exam')
    }
  }

  const eligibleStudents = students.filter(student => {
    if (!selectedExam) return false

    const yearLevel = student.enrollments[0]?.yearLevel

    if (selectedExam.yearLevel === 'BOTH') return true
    if (selectedExam.yearLevel === yearLevel) return true

    return false
  })

  const filteredStudents = eligibleStudents.filter(student => {
    if (searchTerm && !student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }

    if (filterMentees && session?.user?.id) {
      if (!student.enrollments.some(e => e.mentorId === session.user.id)) {
        return false
      }
    }

    if (onlyMissing && scores.has(student.id)) return false

    return true
  })

  // PRIEST is read-only, only SUPER_ADMIN and SERVANT_PREP can manage exams
  const canEdit = session?.user?.role && canManageExams(session.user.role)

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  const setSection = (value: string) => {
    setSelectedSectionId(value)
    const params = new URLSearchParams(window.location.search)
    if (value === 'all') params.delete('section')
    else params.set('section', value)
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
    router.replace(newUrl, { scroll: false })
  }
  const eligibleFor = (exam: Exam) =>
    students.filter((st) => exam.yearLevel === 'BOTH' || st.enrollments[0]?.yearLevel === exam.yearLevel).length
  const visibleExams = exams
    .filter((e) => selectedSectionId === 'all' || e.examSection.id === selectedSectionId)
    .sort((a, b) => new Date(b.examDate).getTime() - new Date(a.examDate).getTime())
  const totalScores = exams.reduce((n, e) => n + (e._count?.scores || 0), 0)
  const missingCount = eligibleStudents.filter((st) => !scores.has(st.id)).length
  const unsaved = eligibleStudents.some((st) => {
    const prev = existingScores.get(st.id)
    return scores.get(st.id) !== (prev?.originalScore ?? undefined) || (notes.get(st.id) || '') !== (prev?.notes || '')
  })

  if (selectedExam) {
    const title = `${selectedExam.examSection.displayName} · ${YEAR_LABEL[selectedExam.yearLevel] ?? selectedExam.yearLevel}`
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader
          title={title}
          meta={['Original and makeup exam scores', lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null]}
          actions={
            <Button variant="outline" onClick={() => setSelectedExam(null)}>
              <ChevronLeft />
              All exams
            </Button>
          }
        />

        <KpiStrip
          items={[
            { label: 'Section', value: <span className="text-[17px] leading-tight font-semibold">{selectedExam.examSection.displayName}</span> },
            { label: 'Exam date', value: <span className="text-[17px] font-semibold">{formatDateUTC(selectedExam.examDate)}</span> },
            { label: 'Total points', value: selectedExam.totalPoints },
            {
              label: 'Entered',
              value: (
                <>
                  {eligibleStudents.length - missingCount}
                  <span className="font-normal text-ink-3"> of {eligibleStudents.length}</span>
                </>
              ),
            },
          ]}
        />

        <Panel
          title="Original exam scores"
          toolbar={
            <>
              <Segmented
                label="Students"
                value={filterMentees ? 'mine' : onlyMissing ? 'missing' : 'all'}
                onChange={(v) => {
                  setFilterMentees(v === 'mine')
                  setOnlyMissing(v === 'missing')
                }}
                options={[
                  { value: 'all', label: 'All', count: eligibleStudents.length },
                  { value: 'missing', label: 'Not entered', count: missingCount },
                  { value: 'mine', label: 'My mentees' },
                ]}
              />
              <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search students" className="md:ml-auto" />
            </>
          }
        >
          {filteredStudents.length === 0 ? (
            <EmptyState message={eligibleStudents.length === 0 ? 'No students are enrolled at this exam’s year level.' : 'No students match these filters.'} />
          ) : (
            <ul className="divide-y divide-line md:table md:w-full md:border-collapse">
              <li className="hidden bg-raised text-xs font-medium text-ink-3 md:table-row" aria-hidden>
                <span className="md:table-cell md:h-9 md:px-3 md:align-middle">Name</span>
                <span className="md:table-cell md:w-36 md:px-3 md:align-middle">Score</span>
                <span className="md:table-cell md:w-44 md:px-3 md:align-middle">Percentage</span>
                <span className="md:table-cell md:px-3 md:align-middle">Notes</span>
                <span className="md:table-cell md:w-28 md:px-3 md:align-middle">Status</span>
              </li>
              {filteredStudents.map((student) => {
                const score = scores.get(student.id)
                const percentage = score !== undefined ? (score / selectedExam.totalPoints) * 100 : null
                const isMentee = student.enrollments.some((e) => e.mentorId === session?.user?.id)
                const prev = existingScores.get(student.id)
                const dirty = score !== (prev?.originalScore ?? undefined) || (notes.get(student.id) || '') !== (prev?.notes || '')
                return (
                  <li key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 md:table-row md:border-t md:border-line md:p-0">
                    <span className="md:table-cell md:h-[52px] md:px-3 md:align-middle">
                      <PersonCell name={student.name} meta={isMentee ? 'Your mentee' : student.enrollments[0]?.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} />
                    </span>
                    <span className="row-span-2 self-center md:table-cell md:px-3 md:align-middle">
                      <span className="flex items-center gap-1.5 text-[13px] text-ink-3">
                        <Input
                          type="number"
                          inputMode="decimal"
                          aria-label={`${student.name} score`}
                          placeholder="—"
                          value={score !== undefined ? score : ''}
                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                          disabled={!canEdit}
                          min={0}
                          max={selectedExam.totalPoints}
                          step="any"
                          className="tabular w-20 text-right md:h-8"
                        />
                        / {selectedExam.totalPoints}
                      </span>
                    </span>
                    <span className="md:table-cell md:px-3 md:align-middle">
                      <Metric value={percentage} target={75} floor={60} width={48} />
                    </span>
                    <span className="col-span-2 md:table-cell md:px-3 md:align-middle">
                      <Input
                        aria-label={`${student.name} notes`}
                        placeholder="Add notes…"
                        value={notes.get(student.id) || ''}
                        onChange={(e) => handleNotesChange(student.id, e.target.value)}
                        disabled={!canEdit}
                        className="md:h-8"
                      />
                    </span>
                    <span className="hidden md:table-cell md:px-3 md:align-middle">
                      {dirty ? (
                        <StatusBadge tone="warn">Edited</StatusBadge>
                      ) : prev ? (
                        <StatusBadge tone="ok">Saved</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Not entered</StatusBadge>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <MakeupExamScores key={selectedExam.id} examId={selectedExam.id} canEdit={!!canEdit} originalUnsaved={unsaved} onSaved={() => openEnterScores(selectedExam)} />

        {canEdit && (
          <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
            <p className="tabular text-[13px] text-ink-2" aria-live="polite">
              <b className="font-semibold text-ink">{eligibleStudents.length - missingCount}</b> of {eligibleStudents.length} entered
              {unsaved && <StatusBadge tone="warn" className="ml-2">Unsaved changes</StatusBadge>}
            </p>
            <Button onClick={saveScores} disabled={saving || !unsaved} className="ml-auto">
              {saving ? 'Saving…' : 'Save scores'}
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Exams"
        meta={['Create exams and enter scores', `${exams.length} exams`, `${totalScores} scores`, lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null]}
        actions={
          canEdit && (
            <Button onClick={() => setShowCreateExam(true)}>
              <Plus />
              Create exam
            </Button>
          )
        }
      />

      <MakeupExamBookings staff />

      <Panel
        toolbar={
          <>
            <FilterSelect
              aria-label="Exam section"
              value={selectedSectionId}
              onChange={setSection}
              options={[{ value: 'all', label: 'All sections' }, ...examSections.map((section) => ({ value: section.id, label: section.displayName }))]}
            />
            <FilterSelect
              aria-label="Academic year"
              value={selectedYearId}
              onChange={setSelectedYearId}
              options={[
                { value: 'all', label: 'All academic years' },
                ...academicYears.map((year) => ({ value: year.id, label: `${year.name.replace('-', '–')}${year.isActive ? ' (active)' : ''}` })),
              ]}
            />
          </>
        }
        footer={<span className="tabular">{visibleExams.length} exams</span>}
      >
        {visibleExams.length === 0 ? (
          <EmptyState
            message={canEdit ? 'No exams here yet. Create one to start entering scores.' : 'No exams here yet.'}
            action={canEdit && <Button variant="outline" onClick={() => setShowCreateExam(true)}>Create exam</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {visibleExams.map((exam) => {
              const eligible = eligibleFor(exam)
              const entered = exam._count?.scores || 0
              const future = new Date(exam.examDate) > new Date()
              return (
                <li key={exam.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <button type="button" onClick={() => openEnterScores(exam)} className="flex min-w-0 flex-1 cursor-pointer flex-col text-left">
                    <span className="truncate text-[13.5px] font-medium text-ink hover:underline">{exam.examSection.displayName}</span>
                    <span className="text-xs text-ink-3">
                      {YEAR_LABEL[exam.yearLevel] ?? exam.yearLevel} · {formatDateUTC(exam.examDate)} · {exam.totalPoints} points
                    </span>
                  </button>
                  <span className="tabular w-20 text-[13px] text-ink-2">
                    {entered} / {eligible}
                  </span>
                  <span className="w-24">
                    {entered === 0 ? (
                      <StatusBadge tone={future ? 'info' : 'warn'}>{future ? 'Scheduled' : 'No scores'}</StatusBadge>
                    ) : entered < eligible ? (
                      <StatusBadge tone="warn">Partial</StatusBadge>
                    ) : (
                      <StatusBadge tone="ok">Graded</StatusBadge>
                    )}
                  </span>
                  <span className="flex items-center gap-1">
                    <Button variant="outline" size="sm" asChild><Link href={`/dashboard/admin/exams/${exam.id}/monitor`}>Answer sheet</Link></Button>
                    <Button variant="outline" size="sm" onClick={() => openEnterScores(exam)}>
                      <PencilLine />
                      {canEdit ? 'Enter scores' : 'View scores'}
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${exam.examSection.displayName} exam`} onClick={(e) => deleteExam(exam.id, e)} className="hover:text-bad">
                        <Trash2 />
                      </Button>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <Dialog open={showCreateExam} onOpenChange={setShowCreateExam}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create exam</DialogTitle>
            <DialogDescription>Scores can be entered once it is created.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="exam-section">Exam section <span className="text-bad">*</span></Label>
              <FilterSelect
                aria-label="Exam section"
                value={newExam.examSectionId}
                onChange={(v) => setNewExam({ ...newExam, examSectionId: v })}
                className="w-full md:h-9"
                options={[{ value: '', label: 'Select section…' }, ...examSections.map((section) => ({ value: section.id, label: section.displayName }))]}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Year level</Label>
              <FilterSelect
                aria-label="Year level"
                value={newExam.yearLevel}
                onChange={(v) => setNewExam({ ...newExam, yearLevel: v as 'YEAR_1' | 'YEAR_2' | 'BOTH' })}
                className="w-full md:h-9"
                options={[
                  { value: 'BOTH', label: 'All students (both years)' },
                  { value: 'YEAR_1', label: 'Year 1 only' },
                  { value: 'YEAR_2', label: 'Year 2 only' },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="exam-date">Exam date <span className="text-bad">*</span></Label>
                <Input id="exam-date" type="date" value={newExam.examDate} onChange={(e) => setNewExam({ ...newExam, examDate: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="exam-points">Total points</Label>
                <Input id="exam-points" type="number" value={newExam.totalPoints} onChange={(e) => setNewExam({ ...newExam, totalPoints: parseInt(e.target.value) })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCreateExam(false)}>Cancel</Button>
              <Button onClick={createExam} disabled={!newExam.examSectionId || !newExam.examDate}>Create exam</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
