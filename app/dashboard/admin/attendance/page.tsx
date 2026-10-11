'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { Button } from '@/components/ui/button'
import { AsyncBadge } from '@/components/async-badge'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import { AttendanceLegend, AttendanceStatusButtons } from '@/components/attendance-status-buttons'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'
import { isAdmin, canManageData } from '@/lib/roles'
import { ChevronDown, ChevronRight, CheckCheck, Rows3, UserX, Plane } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateUTC, formatUTC, formatToastTimestamp, buildStudentMapFromEnrollments } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { AcademicYear } from '@/lib/types'
import { asyncPeriodStart, isAsyncPeriodLesson } from '@/lib/attendance-utils'

interface Lesson {
  id: string
  title: string
  speaker?: string | null
  scheduledDate: string
  lessonNumber: number
  status: string
  academicYearId: string
  isExamDay?: boolean
  examSection: {
    displayName: string
  }
  _count?: {
    attendanceRecords: number
  }
}

interface Student {
  id: string
  name: string
  email: string
  profileImageUrl?: string | null
  enrollments: Array<{
    yearLevel: string
    mentorId: string
    isAsyncStudent?: boolean
    asyncApprovedAt?: string | null
  }>
}

interface AttendanceRecord {
  studentId: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  arrivedAt?: string
  notes?: string
  conductRemoval?: boolean
  conductNote?: string
}

export default function AttendancePage() {
  const { session, status } = useAdminGuard(isAdmin)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [selectedYearId, setSelectedYearId] = useState<string>('')
  const [attendance, setAttendance] = useState<Map<string, AttendanceRecord>>(new Map())
  const [, setExistingAttendance] = useState<Map<string, AttendanceRecord>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterYearLevel, setFilterYearLevel] = useState<string>('all')
  const [filterMentees, setFilterMentees] = useState(false)
  const [lessonStatusFilter, setLessonStatusFilter] = useState<string>('all')
  const [lessonView, setLessonView] = useState<'needs' | 'done'>('needs')
  const deepLinkApplied = useRef(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [compactMode, setCompactMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [conductRemovalDialog, setConductRemovalDialog] = useState<{ studentId: string; studentName: string } | null>(null)
  const [conductNoteInput, setConductNoteInput] = useState('')
  // Expected absences covering the selected lesson, keyed by studentId
  const [expectedAbsences, setExpectedAbsences] = useState<Map<string, { id: string; reason: string; markAsNA: boolean }>>(new Map())

  // Fetch academic years and students on mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [yearsRes, enrollmentsRes] = await Promise.all([
          fetch('/api/academic-years'),
          fetch('/api/enrollments')
        ])

        if (!yearsRes.ok || !enrollmentsRes.ok) {
          setStudents([])
          setAcademicYears([])
          setLoading(false)
          return
        }

        const [yearsData, enrollmentsData] = await Promise.all([
          yearsRes.json(),
          enrollmentsRes.json()
        ])

        const years = Array.isArray(yearsData) ? yearsData : []
        setAcademicYears(years)

        // Default to active academic year for focused view
        const activeYear = years.find((y: AcademicYear) => y.isActive)
        setSelectedYearId(activeYear?.id || 'all')

        // Build student map from enrollments
        const studentList = buildStudentMapFromEnrollments(enrollmentsData)
        setStudents(studentList.sort((a, b) => a.name.localeCompare(b.name)) as unknown as Student[])
      } catch {
        setStudents([])
        setAcademicYears([])
      } finally {
        setLoading(false)
      }
    }

    if (session?.user) {
      fetchInitialData()
    }
  }, [session])

  // Fetch lessons when selected year changes
  // Exclude cancelled and exam day lessons at the API level (not needed for attendance)
  useEffect(() => {
    const fetchLessons = async () => {
      try {
        // Build URL with forAttendance filter - excludes cancelled and exam day lessons
        const params = new URLSearchParams({ forAttendance: 'true' })
        if (selectedYearId && selectedYearId !== 'all') {
          params.set('academicYearId', selectedYearId)
        }
        const url = `/api/lessons?${params.toString()}`
        const lessonsRes = await fetch(url)
        if (!lessonsRes.ok) {
          setLessons([])
          return
        }
        const lessonsData = await lessonsRes.json()
        const list: Lesson[] = Array.isArray(lessonsData) ? lessonsData : []
        setLessons(list)
        // Calendar and agenda links open a lesson directly (?lesson=<id>).
        if (!deepLinkApplied.current) {
          const wanted = new URLSearchParams(window.location.search).get('lesson')
          const match = wanted ? list.find((l) => l.id === wanted) : undefined
          if (match) {
            deepLinkApplied.current = true
            setSelectedLesson(match)
          }
        }
      } catch {
        setLessons([])
      }
    }

    fetchLessons()
  }, [selectedYearId])

  useEffect(() => {
    const fetchAttendance = async () => {
      if (!selectedLesson) return

      try {
        const [attRes, eaRes] = await Promise.all([
          fetch(`/api/attendance?lessonId=${selectedLesson.id}`),
          fetch(`/api/expected-absences?lessonId=${selectedLesson.id}`),
        ])
        const records = await attRes.json()

        // Build a map of expected absences covering this lesson, keyed by student
        const eaMap = new Map<string, { id: string; reason: string; markAsNA: boolean }>()
        if (eaRes.ok) {
          const eaData: Array<{ id: string; studentId: string; reason: string; markAsNA?: boolean }> = await eaRes.json()
          eaData.forEach((ea) => eaMap.set(ea.studentId, { id: ea.id, reason: ea.reason, markAsNA: ea.markAsNA === true }))
        }
        setExpectedAbsences(eaMap)

        const recordsMap = new Map<string, AttendanceRecord>()
        records.forEach((record: AttendanceRecord & { studentId: string; conductRemoval?: boolean; conductNote?: string }) => {
          recordsMap.set(record.studentId, record)
        })
        setExistingAttendance(recordsMap)

        const attendanceMap = new Map<string, AttendanceRecord>()
        records.forEach((record: AttendanceRecord & { studentId: string }) => {
          attendanceMap.set(record.studentId, {
            studentId: record.studentId,
            status: record.status,
            arrivedAt: record.arrivedAt,
            notes: record.notes,
            conductRemoval: record.conductRemoval,
            conductNote: record.conductNote,
          })
        })

        // Pre-fill students with an expected absence that have no record yet:
        // Absent by default (counts until manually excused), or Excused (shown
        // as N/A, not counted) when the absence is marked N/A. The reason is
        // pre-filled into notes and admins can still override before saving.
        eaMap.forEach((ea, studentId) => {
          if (!attendanceMap.has(studentId)) {
            attendanceMap.set(studentId, {
              studentId,
              status: ea.markAsNA ? 'EXCUSED' : 'ABSENT',
              notes: ea.reason,
            })
          }
        })

        setAttendance(attendanceMap)
      } catch (error) {
        console.error('Failed to fetch attendance:', error)
      }
    }

    fetchAttendance()
  }, [selectedLesson])

  const updateAttendance = (studentId: string, field: keyof AttendanceRecord, value: string) => {
    const record = attendance.get(studentId) || {
      studentId,
      status: 'PRESENT' as const,
    }

    // Changing the status directly clears any conduct removal
    const updates: Partial<AttendanceRecord> = { [field]: value }
    if (field === 'status') {
      updates.conductRemoval = false
      updates.conductNote = undefined
    }

    setAttendance(new Map(attendance.set(studentId, {
      ...record,
      ...updates,
    })))
    setHasUnsavedChanges(true)
  }

  const handleMarkAllPresent = () => {
    const newAttendance = new Map(attendance)
    filteredStudents.forEach(student => {
      const existing = attendance.get(student.id)
      newAttendance.set(student.id, {
        studentId: student.id,
        status: 'PRESENT',
        arrivedAt: existing?.arrivedAt,
        notes: existing?.notes
      })
    })
    setAttendance(newAttendance)
    setHasUnsavedChanges(true)
  }

  const handleConductRemovalClick = (studentId: string, studentName: string) => {
    const record = attendance.get(studentId)
    if (record?.conductRemoval) {
      // Toggle off - clear the conduct removal
      setAttendance(new Map(attendance.set(studentId, {
        ...record,
        status: 'ABSENT',
        conductRemoval: false,
        conductNote: undefined,
      })))
      setHasUnsavedChanges(true)
    } else {
      // Open dialog to get reason
      setConductNoteInput('')
      setConductRemovalDialog({ studentId, studentName })
    }
  }

  const confirmConductRemoval = () => {
    if (!conductRemovalDialog) return
    if (!conductNoteInput.trim()) {
      toast.error('A reason is required', { description: 'Please provide a reason for removing the student.' })
      return
    }
    const { studentId } = conductRemovalDialog
    const record = attendance.get(studentId) || { studentId, status: 'ABSENT' as const }
    setAttendance(new Map(attendance.set(studentId, {
      ...record,
      status: 'ABSENT',
      conductRemoval: true,
      conductNote: conductNoteInput.trim(),
    })))
    setHasUnsavedChanges(true)
    setConductRemovalDialog(null)
    setConductNoteInput('')
  }

  const saveAttendance = async () => {
    if (!selectedLesson) return

    setSaving(true)
    try {
      // Prepare batch payload - all students in one request (much faster!)
      const records = filteredStudents.map(student => {
        const record = attendance.get(student.id)
        return {
          studentId: student.id,
          status: record?.status || 'ABSENT',
          arrivedAt: record?.arrivedAt || null,
          notes: record?.notes || null,
          conductRemoval: record?.conductRemoval || false,
          conductNote: record?.conductNote || null,
        }
      })

      const res = await fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId: selectedLesson.id,
          records
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to save attendance')
      }

      const result = await res.json()
      const now = new Date()
      setLastSaved(now)
      setHasUnsavedChanges(false)
      toast.success('Attendance saved successfully!', {
        description: `${result.created} created, ${result.updated} updated • ${formatToastTimestamp(now)}`
      })
      setSelectedLesson(null)
    } catch (error) {
      console.error('Failed to save attendance:', error)
      toast.error('Failed to save attendance', {
        description: error instanceof Error ? error.message : 'Please try again.'
      })
    } finally {
      setSaving(false)
    }
  }

  // Async students aren't on the roll call for lessons from the day they went
  // async: their attendance is their Sunday School rotation (slips still count).
  const isAsyncForLesson = (student: Student) =>
    !!selectedLesson &&
    student.enrollments.some((e) => isAsyncPeriodLesson(selectedLesson.scheduledDate, asyncPeriodStart(e)))
  const asyncOffRollCall = students.filter(isAsyncForLesson)

  const filteredStudents = students.filter(student => {
    if (isAsyncForLesson(student)) return false
    if (searchTerm && !student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }

    if (filterYearLevel !== 'all') {
      if (!student.enrollments.some(e => e.yearLevel === filterYearLevel)) {
        return false
      }
    }

    if (filterMentees && session?.user?.id) {
      if (!student.enrollments.some(e => e.mentorId === session.user.id)) {
        return false
      }
    }

    return true
  })

  // Create a map of academic year IDs to names for quick lookup
  const yearNameMap = useMemo(() => {
    const map = new Map<string, string>()
    academicYears.forEach(y => map.set(y.id, y.name))
    return map
  }, [academicYears])

  // Check if we're showing all years
  const showingAllYears = selectedYearId === 'all'

  // Filter lessons by status (lesson status field, not attendance status)
  // Note: Cancelled and exam day lessons are already excluded at the API level
  const filteredLessons = lessons.filter(l => {
    // Apply lesson status filter if set
    if (lessonStatusFilter !== 'all' && l.status !== lessonStatusFilter) return false
    return true
  })

  // Categorize lessons by whether attendance has been taken
  // "Needs Attendance" = no attendance records yet (shown at top)
  // "Completed" = has attendance records (shown at bottom)
  const scheduledLessons = filteredLessons
    .filter(l => (l._count?.attendanceRecords || 0) === 0)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())

  const completedLessons = filteredLessons
    .filter(l => (l._count?.attendanceRecords || 0) > 0)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()) // Most recent first

  // Check if user can manage data (PRIEST is read-only)
  const userCanManageData = session?.user?.role ? canManageData(session.user.role) : false

  // Check if selected lesson is today or in the past (attendance can only be taken on or after the lesson date)
  const isLessonEditable = useMemo(() => {
    if (!selectedLesson) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const lessonDate = new Date(selectedLesson.scheduledDate)
    lessonDate.setHours(0, 0, 0, 0)
    return lessonDate <= today
  }, [selectedLesson])

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  const marked = filteredStudents.reduce(
    (acc, student) => {
      const status = attendance.get(student.id)?.status
      if (status) acc[status] += 1
      else acc.unmarked += 1
      return acc
    },
    { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, unmarked: 0 }
  )
  const yearName = selectedYearId === 'all' ? 'All years' : academicYears.find((y) => y.id === selectedYearId)?.name.replace('-', '–')
  const controlsDisabled = !userCanManageData || !isLessonEditable
  const visibleLessons = lessonView === 'needs' ? scheduledLessons : completedLessons

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Take attendance"
        meta={['Servants Prep', yearName, lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null]}
        actions={
          selectedLesson ? (
            <Button variant="outline" onClick={() => setSelectedLesson(null)}>
              Change lesson
            </Button>
          ) : (
            <>
              <FilterSelect
                aria-label="Academic year"
                value={selectedYearId}
                onChange={setSelectedYearId}
                options={[
                  { value: 'all', label: 'All years' },
                  ...academicYears.map((year) => ({
                    value: year.id,
                    label: `${year.name.replace('Academic Year ', '').replace('-', '–')}${year.isActive ? ' (active)' : ''}`,
                  })),
                ]}
              />
              <FilterSelect
                aria-label="Lesson status"
                value={lessonStatusFilter}
                onChange={setLessonStatusFilter}
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'SCHEDULED', label: 'Scheduled' },
                  { value: 'COMPLETED', label: 'Completed' },
                ]}
              />
            </>
          )
        }
      />

      {!selectedLesson ? (
        <Panel
          toolbar={
            <Segmented
              label="Lessons"
              value={lessonView}
              onChange={setLessonView}
              options={[
                { value: 'needs', label: 'Need attendance', count: scheduledLessons.length },
                { value: 'done', label: 'Taken', count: completedLessons.length },
              ]}
            />
          }
        >
          {visibleLessons.length === 0 ? (
            <EmptyState
              message={
                lessonView === 'needs'
                  ? 'Every lesson in this view has attendance. Switch to “Taken” to review or edit one.'
                  : 'No lesson has attendance yet. Pick one from “Need attendance” to start.'
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {visibleLessons.map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  onClick={() => setSelectedLesson(lesson)}
                  done={lessonView === 'done'}
                  yearName={showingAllYears ? yearNameMap.get(lesson.academicYearId) : undefined}
                />
              ))}
            </ul>
          )}
        </Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-center gap-4 px-4 py-3.5">
              <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-accent-tint text-accent-ink">
                <span className="text-[11px] font-semibold uppercase">
                  {formatUTC(selectedLesson.scheduledDate, { month: 'short' })}
                </span>
                <span className="tabular text-xl leading-none font-semibold">
                  {formatUTC(selectedLesson.scheduledDate, { day: 'numeric' })}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-xs text-ink-3">
                  {formatUTC(selectedLesson.scheduledDate, { weekday: 'long' })} · {selectedLesson.examSection.displayName}
                </span>
                <span className="truncate text-[15px] font-semibold text-ink">
                  Lesson {selectedLesson.lessonNumber} · {selectedLesson.title}
                </span>
                {selectedLesson.speaker && <span className="text-[13px] text-ink-2">{selectedLesson.speaker}</span>}
              </div>
              <span className="tabular text-[13px] text-ink-2">
                <b className="font-semibold text-ink">{filteredStudents.length - marked.unmarked}</b> of {filteredStudents.length} marked
              </span>
            </div>
          </Panel>

          {!isLessonEditable && (
            <div role="status" className="flex items-center gap-2 rounded-lg bg-warn-tint px-4 py-2.5 text-[13px] text-warn">
              Attendance opens on the lesson date (
              {formatDateUTC(selectedLesson.scheduledDate, { weekday: 'short', month: 'short', day: 'numeric' })}).
            </div>
          )}

          <Panel
            toolbar={
              <>
                <Segmented
                  label="Students"
                  value={filterMentees ? 'mine' : 'all'}
                  onChange={(v) => setFilterMentees(v === 'mine')}
                  options={[
                    { value: 'all', label: 'All', count: students.length },
                    { value: 'mine', label: 'My mentees' },
                  ]}
                />
                <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto">
                  <FilterSelect
                    aria-label="Year level"
                    value={filterYearLevel}
                    onChange={setFilterYearLevel}
                    options={[
                      { value: 'all', label: 'All years' },
                      { value: 'YEAR_1', label: 'Year 1' },
                      { value: 'YEAR_2', label: 'Year 2' },
                    ]}
                  />
                  <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Search students" className="flex-1 md:flex-none" />
                  <Button variant="outline" onClick={handleMarkAllPresent} disabled={controlsDisabled}>
                    <CheckCheck />
                    Mark all present
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-pressed={compactMode}
                    aria-label={compactMode ? 'Show arrival and notes' : 'Compact rows'}
                    title={compactMode ? 'Show arrival and notes' : 'Compact rows'}
                    onClick={() => setCompactMode(!compactMode)}
                  >
                    <Rows3 />
                  </Button>
                </div>
              </>
            }
          >
            <div className="border-b border-line px-4 py-2.5">
              <AttendanceLegend />
              {asyncOffRollCall.length > 0 && (
                <p className="mt-1.5 text-xs text-ink-3">
                  Not on this roll call (async): {asyncOffRollCall.map((s) => s.name).join(', ')}. Their attendance comes from
                  their Sunday School rotation; an uploaded slip still marks a lesson Present.
                </p>
              )}
            </div>

            {filteredStudents.length === 0 ? (
              <EmptyState message="No students match these filters." />
            ) : (
              <>
                <table className="hidden w-full text-[13px] md:table">
                  <thead className="bg-raised">
                    <tr className="border-b border-line text-left text-xs text-ink-3">
                      <th scope="col" className="h-9 px-3 font-medium">Name</th>
                      <th scope="col" className="h-9 px-3 font-medium">Status</th>
                      {!compactMode && (
                        <>
                          <th scope="col" className="h-9 w-32 px-3 font-medium">Arrived</th>
                          <th scope="col" className="h-9 px-3 font-medium">Notes</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => {
                      const record = attendance.get(student.id)
                      const ea = expectedAbsences.get(student.id)
                      const enrollment = student.enrollments[0]
                      return (
                        <tr key={student.id} className={`border-b border-line last:border-0 ${compactMode ? 'h-11' : 'h-[52px]'}`}>
                          <td className="px-3">
                            <div className="flex items-center gap-2.5">
                              <Initials name={student.name} imageUrl={student.profileImageUrl} />
                              <div className="flex min-w-0 flex-col leading-[1.3]">
                                <span className="truncate font-medium text-ink">{student.name}</span>
                                <span className="flex items-center gap-1.5 text-xs text-ink-3">
                                  {enrollment?.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}
                                  {enrollment?.isAsyncStudent && <AsyncBadge className="h-[18px] px-1.5 text-[11px]" />}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3">
                            <div className="flex items-center gap-1">
                              <AttendanceStatusButtons
                                currentStatus={record?.status}
                                onStatusChange={(status) => updateAttendance(student.id, 'status', status)}
                                disabled={controlsDisabled}
                                size={compactMode ? 'sm' : 'md'}
                              />
                              <ConductButton
                                active={!!record?.conductRemoval}
                                note={record?.conductNote}
                                disabled={controlsDisabled}
                                onClick={() => handleConductRemovalClick(student.id, student.name)}
                              />
                            </div>
                            <RowNote conductNote={record?.conductRemoval ? record.conductNote : undefined} expected={ea} />
                          </td>
                          {!compactMode && (
                            <>
                              <td className="px-3">
                                <Input
                                  type="time"
                                  aria-label={`${student.name} arrival time`}
                                  value={record?.arrivedAt || ''}
                                  onChange={(e) => updateAttendance(student.id, 'arrivedAt', e.target.value)}
                                  disabled={controlsDisabled}
                                  className="md:h-8"
                                />
                              </td>
                              <td className="px-3">
                                <Input
                                  type="text"
                                  aria-label={`${student.name} notes`}
                                  placeholder="Add notes…"
                                  value={record?.notes || ''}
                                  onChange={(e) => updateAttendance(student.id, 'notes', e.target.value)}
                                  disabled={controlsDisabled}
                                  className="md:h-8"
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <ul className="divide-y divide-line md:hidden">
                  {filteredStudents.map((student) => {
                    const record = attendance.get(student.id)
                    const ea = expectedAbsences.get(student.id)
                    const isExpanded = expandedStudentId === student.id
                    return (
                      <li key={student.id} className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Initials name={student.name} imageUrl={student.profileImageUrl} size={32} />
                          <button
                            type="button"
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
                            aria-expanded={isExpanded}
                            onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                          >
                            <span className="truncate text-[15px] font-medium text-ink">{student.name}</span>
                            {isExpanded ? <ChevronDown className="size-4 shrink-0 text-ink-3" /> : <ChevronRight className="size-4 shrink-0 text-ink-3" />}
                          </button>
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <AttendanceStatusButtons
                            currentStatus={record?.status}
                            onStatusChange={(status) => updateAttendance(student.id, 'status', status)}
                            disabled={controlsDisabled}
                          />
                          <ConductButton
                            active={!!record?.conductRemoval}
                            note={record?.conductNote}
                            disabled={controlsDisabled}
                            onClick={() => handleConductRemovalClick(student.id, student.name)}
                          />
                        </div>
                        <RowNote conductNote={record?.conductRemoval ? record.conductNote : undefined} expected={ea} />
                        {isExpanded && (
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
                              Arrived
                              <Input
                                type="time"
                                value={record?.arrivedAt || ''}
                                onChange={(e) => updateAttendance(student.id, 'arrivedAt', e.target.value)}
                                disabled={controlsDisabled}
                              />
                            </label>
                            <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-2">
                              Notes
                              <Input
                                type="text"
                                placeholder="Add notes…"
                                value={record?.notes || ''}
                                onChange={(e) => updateAttendance(student.id, 'notes', e.target.value)}
                                disabled={controlsDisabled}
                              />
                            </label>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Panel>

          {/* Save bar: sticks to the bottom of the content column, above the phone tab bar. */}
          <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
            <p className="tabular flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-2" aria-live="polite">
              <span><b className="font-semibold text-ok">{marked.PRESENT}</b> present</span>·
              <span><b className="font-semibold text-warn">{marked.LATE}</b> late</span>·
              <span><b className="font-semibold text-bad">{marked.ABSENT}</b> absent</span>·
              <span><b className="font-semibold text-ink">{marked.unmarked}</b> unmarked</span>
              {hasUnsavedChanges && <StatusBadge tone="warn" className="ml-1">Unsaved</StatusBadge>}
              {marked.unmarked > 0 && <span className="w-full text-xs text-ink-3">Unmarked students are saved as absent.</span>}
            </p>
            {userCanManageData && (
              <Button onClick={saveAttendance} disabled={saving || !isLessonEditable} className="ml-auto">
                {saving ? 'Saving…' : !isLessonEditable ? 'Future lesson' : 'Save attendance'}
              </Button>
            )}
          </div>
        </>
      )}

      <Dialog open={!!conductRemovalDialog} onOpenChange={(open) => { if (!open) setConductRemovalDialog(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove from lesson</DialogTitle>
            <DialogDescription>
              {conductRemovalDialog && (
                <>
                  <strong>{conductRemovalDialog.studentName}</strong> will be marked as removed from this lesson. It counts
                  as an absence. A reason is required.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="conduct-note">
              Reason for removal <span className="text-bad">*</span>
            </Label>
            <Textarea
              id="conduct-note"
              placeholder="Describe why the student was removed…"
              value={conductNoteInput}
              onChange={(e) => setConductNoteInput(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConductRemovalDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmConductRemoval} disabled={!conductNoteInput.trim()}>
              Remove from lesson
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}

function ConductButton({ active, note, disabled, onClick }: { active: boolean; note?: string; disabled: boolean; onClick: () => void }) {
  const label = active ? `Removed from lesson: ${note ?? ''}` : 'Remove from lesson (conduct)'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`ml-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border transition-colors md:size-[30px] ${
        active ? 'border-bad bg-bad-tint text-bad' : 'border-transparent text-ink-3 hover:border-line-strong hover:text-bad'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <UserX className="size-4" />
    </button>
  )
}

function RowNote({
  conductNote,
  expected,
}: {
  conductNote?: string
  expected?: { reason: string; markAsNA: boolean }
}) {
  if (conductNote) {
    return (
      <p className="mt-1 max-w-[260px] truncate text-[11.5px] text-bad" title={conductNote}>
        Removed: {conductNote}
      </p>
    )
  }
  if (expected) {
    return (
      <p className="mt-1 flex max-w-[260px] items-center gap-1 truncate text-[11.5px] text-info" title={expected.reason}>
        <Plane className="size-3 shrink-0" aria-hidden />
        Expected absence{expected.markAsNA ? ' (N/A)' : ''}: {expected.reason}
      </p>
    )
  }
  return null
}

function LessonRow({
  lesson,
  onClick,
  done,
  yearName,
}: {
  lesson: Lesson
  onClick: () => void
  done: boolean
  yearName?: string
}) {
  const attended = lesson._count?.attendanceRecords || 0
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left hover:bg-hover/60"
      >
        <span className="flex w-11 shrink-0 flex-col items-center leading-tight">
          <span className="text-[11px] font-medium text-ink-3 uppercase">
            {formatUTC(lesson.scheduledDate, { month: 'short' })}
          </span>
          <span className="tabular text-lg font-semibold text-ink">{formatUTC(lesson.scheduledDate, { day: 'numeric' })}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium text-ink">
            Lesson {lesson.lessonNumber} · {lesson.title}
          </span>
          <span className="truncate text-xs text-ink-3">
            {formatUTC(lesson.scheduledDate, { weekday: 'long' })} · {lesson.examSection.displayName}
            {yearName ? ` · ${yearName}` : ''}
          </span>
        </span>
        {done ? (
          <StatusBadge tone="ok">{attended} attended</StatusBadge>
        ) : (
          <StatusBadge tone="warn">Needs attendance</StatusBadge>
        )}
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  )
}
