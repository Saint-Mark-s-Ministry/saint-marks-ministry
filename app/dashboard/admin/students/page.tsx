'use client'

import { Suspense, useEffect, useState } from 'react'
import { ContactLink } from '@/components/contact-link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { isAdmin } from '@/lib/roles'
import type { AcademicYear } from '@/lib/types'
import { formatToastTimestamp } from '@/lib/utils'
import {
  sortStudentTableRows,
  type SortDirection,
  type StudentTableSortKey,
} from '@/lib/student-table-sort'
import { toast } from 'sonner'
import { ChevronUp, ChevronDown, ArrowUpDown, X, Trash2, UserPlus, Pencil, GraduationCap, UserX, ClipboardList } from 'lucide-react'
import { StudentDetailsModal } from '@/components/student-details-modal'
import { BulkStudentImport } from '@/components/bulk-student-import'
import { YearEndReviewPanel } from '@/components/year-end-review-panel'
import { GraduationDialog } from '@/components/graduation-dialog'
import { AsyncBadge } from '@/components/async-badge'
import type { EditableStudent } from '@/components/student-program-editor'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge, type Tone } from '@/components/ds/status-badge'
import { Metric } from '@/components/ds/metric'
import { Initials, PersonCell } from '@/components/ds/person'
import { DetailPanel, SplitView } from '@/components/ds/detail-panel'
import { KeyValueList } from '@/components/ds/kv-list'
import { BulkBar } from '@/components/ds/bulk-bar'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { LastSaved } from '@/components/ui/last-saved'

interface Student {
  id: string
  name: string
  email: string
  phone?: string
  profileImageUrl?: string | null
  enrollments?: Array<{
    id: string
    yearLevel: 'YEAR_1' | 'YEAR_2'
    isActive: boolean
    status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN'
    notes?: string
    isAsyncStudent?: boolean
    mentor?: {
      id: string
      name: string
    }
  }>
}

interface StudentAnalytics {
  studentId: string
  studentName: string
  yearLevel: 'YEAR_1' | 'YEAR_2'
  attendancePercentage: number | null
  year1AttendancePercentage: number | null
  year2AttendancePercentage: number | null  // null for Year 1 students (not in Year 2 yet)
  avgExamScore: number | null
  examAverage: number | null
  totalLessons: number
  year1TotalLessons: number
  year2TotalLessons: number | null  // null for Year 1 students
  attendedLessons: number
  year1AttendedLessons: number
  year2AttendedLessons: number | null  // null for Year 1 students
  examCount: number
  // Graduation eligibility fields
  graduationEligible: boolean
  attendanceMet: boolean
  examAverageMet: boolean
  allSectionsMet: boolean
  // Conduct removals
  conductDismissalCount: number
}

interface ExamScore {
  id: string
  score: number
  percentage: number
  notes?: string
  exam: {
    id: string
    examDate: string | Date
    totalPoints: number
    examSection: {
      id: string
      name: string
      displayName: string
      yearLevel: string
    }
  }
  grader?: {
    id: string
    name: string
  }
}

interface AttendanceRecord {
  id: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  arrivedAt?: string | Date
  notes?: string
  lesson: {
    id: string
    title: string
    scheduledDate: string | Date
    isExamDay?: boolean
    examSection: {
      id: string
      name: string
      displayName: string
      yearLevel: string
    }
    academicYear?: {
      id: string
      name: string
    }
  }
  recorder?: {
    id: string
    name: string
  }
}

interface Exam {
  id: string
  examDate: string | Date
  totalPoints: number
  yearLevel: string
  examSection: {
    id: string
    name: string
    displayName: string
  }
}

interface Lesson {
  id: string
  title: string
  scheduledDate: string | Date
  examSection: {
    id: string
    name: string
    displayName: string
  }
}

interface StudentDetails {
  student: EditableStudent
  examScores: ExamScore[]
  attendanceRecords: AttendanceRecord[]
  allExams: Exam[]
  allLessons: Lesson[]
}

function SortableTableHeader({
  column,
  label,
  activeColumn,
  direction,
  onSort,
  className,
}: {
  className?: string
  column: StudentTableSortKey
  label: string
  activeColumn: StudentTableSortKey | null
  direction: SortDirection
  onSort: (column: StudentTableSortKey) => void
}) {
  const isActive = activeColumn === column
  const ariaSort = isActive
    ? direction === 'asc' ? 'ascending' : 'descending'
    : 'none'

  return (
    <th scope="col" className={`p-0 text-left text-xs font-medium text-ink-3 ${className ?? ''}`} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex h-9 w-full cursor-pointer items-center gap-1 px-3 text-left whitespace-nowrap hover:text-ink"
        title={`Sort by ${label}`}
      >
        <span>{label}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp className="size-3.5 text-ink" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5 text-ink" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-60" aria-hidden="true" />
        )}
      </button>
    </th>
  )
}

function StudentsManagementContent() {
  const { session, status } = useAdminGuard(isAdmin)
  const router = useRouter()
  const searchParams = useSearchParams()
  const [students, setStudents] = useState<Student[]>([])
  const [analytics, setAnalytics] = useState<StudentAnalytics[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [filterYearLevel, setFilterYearLevel] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showGraduateDialog, setShowGraduateDialog] = useState(false)
  const [showYearEndPanel, setShowYearEndPanel] = useState(false)
  const [activeYear, setActiveYear] = useState<AcademicYear | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [viewingStudent, setViewingStudent] = useState<string | null>(null)
  const [studentDetails, setStudentDetails] = useState<StudentDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [, setAcademicYearId] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<StudentTableSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    if (session?.user) {
      fetchStudents()
    }
  }, [session])

  // ?filter=review (from the dashboard) opens the list on students needing review.
  useEffect(() => {
    if (searchParams.get('filter') === 'review') setFilterStatus('review')
  }, [searchParams])

  // Handle URL parameter to open student details modal directly
  useEffect(() => {
    const studentId = searchParams.get('student')
    if (studentId && students.length > 0 && !loading) {
      // Check if the student exists
      const student = students.find(s => s.id === studentId)
      if (student) {
        setPreviewId(studentId)
        // Clear the URL parameter after opening
        router.replace('/dashboard/admin/students', { scroll: false })
      }
    }
  }, [searchParams, students, loading, router])

  const fetchStudents = async () => {
    try {
      // Fetch students and academic years in parallel (much faster!)
      const [studentsRes, yearsRes] = await Promise.all([
        fetch('/api/users?role=STUDENT'),
        fetch('/api/academic-years')
      ])

      if (studentsRes.ok) {
        const data = await studentsRes.json()
        setStudents(data)
      }

      if (yearsRes.ok) {
        const years = await yearsRes.json()
        const activeYearData = years.find((y: AcademicYear) => y.isActive)

        if (activeYearData) {
          setAcademicYearId(activeYearData.id)
          setActiveYear(activeYearData)
        }
      }

      // Fetch analytics without filtering by year - aggregate across ALL academic years
      // This is needed for graduation tracking since students take exams across both Year 1 and Year 2
      const analyticsRes = await fetch('/api/students/analytics/batch')
      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json()
        setAnalytics(analyticsData)
      }
    } catch (error) {
      console.error('Failed to fetch students:', error)
    } finally {
      setLoading(false)
    }
  }

  const openStudentDetails = async (studentId: string) => {
    setViewingStudent(studentId)
    setDetailsLoading(true)

    try {
      // Fetch details without filtering by year - aggregate across ALL academic years
      const res = await fetch(`/api/students/${studentId}/details`)
      if (res.ok) {
        const data = await res.json()
        setStudentDetails(data)
      } else {
        toast.error('Failed to load student details')
      }
    } catch (error) {
      console.error('Failed to fetch student details:', error)
      toast.error('Failed to load student details')
    } finally {
      setDetailsLoading(false)
    }
  }

  const refreshStudentDetails = async () => {
    if (viewingStudent) {
      await Promise.all([openStudentDetails(viewingStudent), fetchStudents()])
    }
  }

  const toggleStudent = (studentId: string) => {
    const newSelected = new Set(selectedStudents)
    if (newSelected.has(studentId)) {
      newSelected.delete(studentId)
    } else {
      newSelected.add(studentId)
    }
    setSelectedStudents(newSelected)
  }

  const selectAll = () => {
    const filtered = getFilteredStudents()
    if (selectedStudents.size === filtered.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(filtered.map(s => s.id)))
    }
  }

  const updateYearLevel = async (studentIds: string[], yearLevel: 'YEAR_1' | 'YEAR_2') => {
    try {
      // Get enrollment IDs
      const enrollmentIds = studentIds
        .map(id => students.find(s => s.id === id)?.enrollments?.[0]?.id)
        .filter((id): id is string => !!id)

      if (enrollmentIds.length === 0) {
        toast.error('No valid enrollments found')
        return
      }

      // Use bulk update API for better performance
      const res = await fetch('/api/enrollments/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentIds,
          updates: { yearLevel }
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      const result = await res.json()

      const now = new Date()
      setLastSaved(now)
      toast.success(`Updated ${enrollmentIds.length} student(s) to ${yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}`, {
        description: yearLevel === 'YEAR_2' && result.promotion
          ? `Year 1 attendance preserved${result.promotion.attendanceRecordsCreated > 0 ? ` · ${result.promotion.attendanceRecordsCreated} active-year records added` : ''} · ${formatToastTimestamp(now)}`
          : formatToastTimestamp(now)
      })

      await fetchStudents()
      setSelectedStudents(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update year level')
    }
  }

  const updateEnrollmentStatus = async (studentIds: string[], status: 'ACTIVE' | 'GRADUATED' | 'WITHDRAWN') => {
    try {
      // Get enrollment IDs
      const enrollmentIds = studentIds
        .map(id => students.find(s => s.id === id)?.enrollments?.[0]?.id)
        .filter((id): id is string => !!id)

      if (enrollmentIds.length === 0) {
        toast.error('No valid enrollments found')
        return
      }

      // Use bulk update API for better performance
      const res = await fetch('/api/enrollments/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentIds,
          updates: { status }
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to update')
      }

      const now = new Date()
      setLastSaved(now)
      const statusText = status === 'GRADUATED' ? 'Graduated' : status === 'WITHDRAWN' ? 'Withdrawn' : 'Active'
      toast.success(`Marked ${enrollmentIds.length} student(s) as ${statusText}`, {
        description: formatToastTimestamp(now)
      })

      await fetchStudents()
      setSelectedStudents(new Set())
      setShowGraduateDialog(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update enrollment status')
    }
  }

  // Handle graduation with optional exception note
  const handleGraduateStudents = async (enrollmentIds: string[], graduationNote?: string) => {
    try {
      const res = await fetch('/api/enrollments/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollmentIds,
          updates: {
            status: 'GRADUATED',
            graduationNote
          }
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Failed to graduate students')
      }

      const now = new Date()
      setLastSaved(now)
      toast.success(`Graduated ${enrollmentIds.length} student(s)`, {
        description: graduationNote
          ? 'Exception noted: ' + graduationNote.substring(0, 50) + (graduationNote.length > 50 ? '...' : '')
          : formatToastTimestamp(now)
      })

      await fetchStudents()
      setSelectedStudents(new Set())
      setShowGraduateDialog(false)
    } catch (error) {
      throw error  // Re-throw so the dialog can handle it
    }
  }

  const bulkDeleteUsers = async (userIds: string[]) => {
    if (!confirm(`Are you sure you want to permanently delete ${userIds.length} user(s)? This action cannot be undone.`)) {
      return
    }

    try {
      const res = await fetch('/api/users/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds })
      })

      if (res.ok) {
        const result = await res.json()
        toast.success(result.message)
        await fetchStudents()
        setSelectedStudents(new Set())
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to delete users')
      }
    } catch (error) {
      console.error('Failed to delete users:', error)
      toast.error('Failed to delete users')
    }
  }

  const createEnrollments = async (studentIds: string[], yearLevel: 'YEAR_1' | 'YEAR_2') => {
    try {
      for (const studentId of studentIds) {
        const res = await fetch('/api/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            yearLevel,
            isActive: true
          })
        })

        if (!res.ok) {
          const error = await res.json()
          toast.error(`Failed to enroll student: ${error.error}`)
          return
        }
      }

      toast.success(`Successfully enrolled ${studentIds.length} student(s) in ${yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}`)
      await fetchStudents()
      setSelectedStudents(new Set())
    } catch (error) {
      console.error('Failed to create enrollments:', error)
      toast.error('Failed to create enrollments')
    }
  }

  const getFilteredStudents = () => {
    return students.filter(student => {
      if (searchTerm && !student.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }

      if (filterYearLevel !== 'all' && student.enrollments?.[0]?.yearLevel !== filterYearLevel) {
        return false
      }

      const enrollment = student.enrollments?.[0]
      if (filterStatus === 'review') {
        const a = analytics.find((x) => x.studentId === student.id)
        if (!(enrollment?.yearLevel === 'YEAR_2' && enrollment.status === 'ACTIVE' && !a?.graduationEligible)) return false
      } else if (filterStatus !== 'all' && enrollment?.status !== filterStatus) {
        return false
      }

      return true
    })
  }

  const handleSort = (column: StudentTableSortKey) => {
    if (sortColumn === column) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }

    setSortColumn(column)
    setSortDirection('asc')
  }

  if (loading || status === 'loading') {
    return <PageLoading />
  }

  const filtered = getFilteredStudents()
  const filteredStudents = sortColumn
    ? sortStudentTableRows(filtered, analytics, sortColumn, sortDirection)
    : filtered
  const hasActiveSort = sortColumn !== null
  const activeCount = students.filter(s => s.enrollments?.[0]?.status === 'ACTIVE').length
  const graduatedCount = students.filter(s => s.enrollments?.[0]?.status === 'GRADUATED').length
  const year1Count = students.filter(s => s.enrollments?.[0]?.yearLevel === 'YEAR_1' && s.enrollments?.[0]?.status === 'ACTIVE').length
  const year2Count = students.filter(s => s.enrollments?.[0]?.yearLevel === 'YEAR_2' && s.enrollments?.[0]?.status === 'ACTIVE').length

  const reviewCount = students.filter((s) => {
    const e = s.enrollments?.[0]
    const a = analytics.find((x) => x.studentId === s.id)
    return e?.yearLevel === 'YEAR_2' && e.status === 'ACTIVE' && !a?.graduationEligible
  }).length
  const withdrawnCount = students.filter((s) => s.enrollments?.[0]?.status === 'WITHDRAWN').length
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'
  const preview = previewId ? students.find((s) => s.id === previewId) : undefined
  const previewAnalytics = preview ? analytics.find((a) => a.studentId === preview.id) : undefined
  const selectedIds = Array.from(selectedStudents)

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Students"
        meta={[
          `${students.length} total`,
          `${activeCount} active`,
          `${year1Count} in Year 1`,
          `${year2Count} in Year 2`,
          `${graduatedCount} graduated`,
          lastSaved ? <LastSaved key="saved" date={lastSaved} /> : null,
        ]}
        actions={
          <>
            <Button variant="outline" aria-expanded={showYearEndPanel} onClick={() => setShowYearEndPanel(!showYearEndPanel)}>
              <ClipboardList />
              Year-end review
            </Button>
            {isSuperAdmin && <BulkStudentImport onSuccess={fetchStudents} />}
          </>
        }
      />

      <YearEndReviewPanel
        activeYear={activeYear}
        analytics={analytics}
        isVisible={showYearEndPanel}
        onToggle={() => setShowYearEndPanel(!showYearEndPanel)}
        onGraduateEligible={() => {
          const eligibleStudents = students.filter((s) => {
            const studentAnalytics = analytics.find((a) => a.studentId === s.id)
            return s.enrollments?.[0]?.yearLevel === 'YEAR_2' && s.enrollments?.[0]?.status === 'ACTIVE' && studentAnalytics?.graduationEligible
          })
          setSelectedStudents(new Set(eligibleStudents.map((s) => s.id)))
          if (eligibleStudents.length > 0) setShowGraduateDialog(true)
          else toast.error('No eligible students found')
        }}
        onPromoteYear1={() => {
          const year1StudentIds = students
            .filter((s) => s.enrollments?.[0]?.yearLevel === 'YEAR_1' && s.enrollments?.[0]?.status === 'ACTIVE')
            .map((s) => s.id)
          if (year1StudentIds.length > 0) {
            setSelectedStudents(new Set(year1StudentIds))
            updateYearLevel(year1StudentIds, 'YEAR_2')
          } else {
            toast.error('No Year 1 students found')
          }
        }}
        onYearCreated={fetchStudents}
      />

      <SplitView>
        <Panel
          className="flex-1"
          toolbar={
            <>
              <Segmented
                label="Enrollment status"
                value={filterStatus}
                onChange={setFilterStatus}
                options={[
                  { value: 'all', label: 'All', count: students.length },
                  { value: 'ACTIVE', label: 'Active', count: activeCount },
                  { value: 'review', label: 'Review', count: reviewCount },
                  { value: 'GRADUATED', label: 'Graduated', count: graduatedCount },
                  { value: 'WITHDRAWN', label: 'Withdrawn', count: withdrawnCount },
                ]}
              />
              <div className="flex w-full flex-wrap items-center gap-2 xl:ml-auto xl:w-auto">
                {hasActiveSort && (
                  <Button variant="ghost" size="sm" onClick={() => { setSortColumn(null); setSortDirection('asc') }}>
                    <X />
                    Clear sort
                  </Button>
                )}
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
              </div>
            </>
          }
          footer={<span className="tabular">Showing {filteredStudents.length} of {students.length}</span>}
        >
          <BulkBar count={selectedStudents.size} noun={selectedStudents.size === 1 ? 'student selected' : 'students selected'} onClear={() => setSelectedStudents(new Set())}>
            <Button size="sm" variant="outline" onClick={() => updateYearLevel(selectedIds, 'YEAR_1')}>
              <ChevronDown />
              Move to Year 1
            </Button>
            <Button size="sm" variant="outline" onClick={() => updateYearLevel(selectedIds, 'YEAR_2')}>
              <ChevronUp />
              Move to Year 2
            </Button>
            <Button size="sm" variant="outline" onClick={() => createEnrollments(selectedIds, 'YEAR_1')}>
              <UserPlus />
              Enroll Year 1
            </Button>
            <Button size="sm" variant="outline" onClick={() => createEnrollments(selectedIds, 'YEAR_2')}>
              <UserPlus />
              Enroll Year 2
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowGraduateDialog(true)}>
              <GraduationCap />
              Graduate
            </Button>
            <Button size="sm" variant="outline" onClick={() => updateEnrollmentStatus(selectedIds, 'WITHDRAWN')}>
              Withdraw
            </Button>
            {isSuperAdmin && (
              <Button size="sm" variant="destructive" onClick={() => bulkDeleteUsers(selectedIds)}>
                <Trash2 />
                Delete
              </Button>
            )}
          </BulkBar>

          {filteredStudents.length === 0 ? (
            <EmptyState message="No students match these filters." />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-[13px] text-ink">
                  <thead className="bg-raised">
                    <tr className="border-b border-line">
                      <th scope="col" className="w-10 pl-3">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                          onChange={selectAll}
                          className="size-[15px] accent-brand"
                        />
                      </th>
                      <SortableTableHeader column="name" label="Student" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} />
                      {!preview && <SortableTableHeader column="year" label="Year" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-24" />}
                      {!preview && <SortableTableHeader column="year1Attendance" label="Y1 attendance" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-44" />}
                       <SortableTableHeader column="year2Attendance" label={preview ? 'Attendance' : 'Y2 attendance'} activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-44" />
                      <SortableTableHeader column="examAverage" label="Exam avg" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-40" />
                      <SortableTableHeader column="eligibility" label="Eligibility" activeColumn={sortColumn} direction={sortDirection} onSort={handleSort} className="w-28" />
                      <th scope="col" className="w-10"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => {
                      const a = analytics.find((x) => x.studentId === student.id)
                      const enrollment = student.enrollments?.[0]
                      const selected = selectedStudents.has(student.id)
                      return (
                        <tr
                          key={student.id}
                          className={`h-[52px] border-b border-line last:border-0 ${selected || previewId === student.id ? 'bg-accent-tint' : 'hover:bg-hover/60'}`}
                        >
                          <td className="pl-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${student.name}`}
                              checked={selected}
                              onChange={() => toggleStudent(student.id)}
                              className="size-[15px] accent-brand"
                            />
                          </td>
                          <td className="px-3">
                            <PersonCell
                              name={student.name}
                              imageUrl={student.profileImageUrl}
                              meta={student.email || 'No email on file'}
                              onClick={() => setPreviewId(student.id)}
                            />
                          </td>
                          {!preview && (
                            <td className="px-3">
                              <YearCell enrollment={enrollment} />
                            </td>
                          )}
                          {!preview && (
                            <td className="px-3">
                              <Metric value={a?.year1AttendancePercentage} detail={a && a.year1AttendancePercentage !== null ? `${a.year1AttendedLessons}/${a.year1TotalLessons}` : undefined} width={48} />
                            </td>
                          )}
                          <td className="px-3">
                            <Metric value={preview ? (a?.year2AttendancePercentage ?? a?.year1AttendancePercentage) : a?.year2AttendancePercentage} detail={!preview && a && a.year2AttendancePercentage !== null ? `${a.year2AttendedLessons}/${a.year2TotalLessons}` : undefined} width={48} />
                          </td>
                          <td className="px-3">
                            <Metric value={a?.avgExamScore} detail={!preview && a && a.avgExamScore !== null ? `${a.examCount} exam${a.examCount !== 1 ? 's' : ''}` : undefined} width={48} />
                          </td>
                          <td className="px-3">
                            <EligibilityBadge enrollment={enrollment} eligible={a?.graduationEligible} />
                          </td>
                          <td className="pr-2">
                            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${student.name}`} title="Edit student" onClick={() => openStudentDetails(student.id)}>
                              <Pencil />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line lg:hidden">
                {filteredStudents.map((student) => {
                  const a = analytics.find((x) => x.studentId === student.id)
                  const enrollment = student.enrollments?.[0]
                  return (
                    <li key={student.id} className="flex items-center gap-3 px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${student.name}`}
                        checked={selectedStudents.has(student.id)}
                        onChange={() => toggleStudent(student.id)}
                        className="size-5 shrink-0 accent-brand"
                      />
                      <button type="button" onClick={() => setPreviewId(student.id)} className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                        <Initials name={student.name} imageUrl={student.profileImageUrl} size={32} enlarge={false} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[15px] font-medium text-ink">{student.name}</span>
                          <span className="truncate text-xs text-ink-3">
                            {enrollment ? (enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2') : 'Not enrolled'}
                            {' · '}Att {(enrollment?.yearLevel === 'YEAR_1' ? a?.year1AttendancePercentage : a?.year2AttendancePercentage)?.toFixed(0) ?? '—'}%
                            {' · '}Exam {a?.avgExamScore?.toFixed(0) ?? '—'}%
                          </span>
                        </span>
                      </button>
                      <EligibilityBadge enrollment={enrollment} eligible={a?.graduationEligible} />
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Panel>

        <DetailPanel
          open={!!preview}
          onClose={() => setPreviewId(null)}
          label={preview?.name}
          title={
            preview ? (
              <div className="flex items-center gap-3">
                <Initials name={preview.name} imageUrl={preview.profileImageUrl} size={40} />
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="truncate text-[15px] font-semibold text-ink">{preview.name}</h2>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.enrollments?.[0] && <EnrollmentBadge status={preview.enrollments[0].status} />}
                    <EligibilityBadge enrollment={preview.enrollments?.[0]} eligible={previewAnalytics?.graduationEligible} />
                    {preview.enrollments?.[0] && (
                      <StatusBadge tone="neutral" dot={false}>
                        {preview.enrollments[0].yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}
                      </StatusBadge>
                    )}
                  </div>
                </div>
              </div>
            ) : ''
          }
          footer={
            preview && (
              <Button className="flex-1" onClick={() => openStudentDetails(preview.id)}>
                <Pencil />
                Edit student
              </Button>
            )
          }
        >
          {preview && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3">
                {[
                  { label: 'Year 1 attendance', value: previewAnalytics?.year1AttendancePercentage, detail: previewAnalytics ? `${previewAnalytics.year1AttendedLessons} of ${previewAnalytics.year1TotalLessons} lessons` : undefined },
                  { label: 'Year 2 attendance', value: previewAnalytics?.year2AttendancePercentage, detail: previewAnalytics?.year2TotalLessons ? `${previewAnalytics.year2AttendedLessons} of ${previewAnalytics.year2TotalLessons} lessons` : undefined },
                  { label: 'Exam average', value: previewAnalytics?.avgExamScore, detail: previewAnalytics ? `${previewAnalytics.examCount} exams` : undefined },
                ].map((m) => (
                  <div key={m.label} className="flex flex-col gap-1.5 rounded-md bg-raised px-3 py-2.5">
                    <span className="text-xs font-medium text-ink-3">{m.label}</span>
                    <Metric value={m.value} detail={m.detail} width={120} />
                  </div>
                ))}
              </div>
              <KeyValueList
                items={[
                  { label: 'Email', value: preview.email ? <ContactLink kind="email" value={preview.email} name={preview.name} label="student email" /> : '—' },
                  { label: 'Phone', value: preview.phone ? <ContactLink kind="phone" value={preview.phone} name={preview.name} label="student phone number" className="font-mono text-xs" /> : '—' },
                  { label: 'Mentor', value: preview.enrollments?.[0]?.mentor?.name ?? <span className="text-ink-3">Not assigned</span> },
                  { label: 'Program', value: preview.enrollments?.[0]?.isAsyncStudent ? 'Async' : 'In person' },
                  ...(previewAnalytics && previewAnalytics.conductDismissalCount > 0
                    ? [{ label: 'Removals', value: <span className="inline-flex items-center gap-1 text-bad"><UserX className="size-3.5" />{previewAnalytics.conductDismissalCount} from lessons</span> }]
                    : []),
                  ...(preview.enrollments?.[0]?.notes ? [{ label: 'Notes', value: preview.enrollments[0].notes }] : []),
                ]}
              />
            </div>
          )}
        </DetailPanel>
      </SplitView>

      <GraduationDialog
        open={showGraduateDialog}
        onOpenChange={setShowGraduateDialog}
        selectedStudents={students.filter((s) => selectedStudents.has(s.id))}
        analytics={analytics}
        onGraduate={handleGraduateStudents}
      />

      <StudentDetailsModal
        studentId={viewingStudent}
        studentName={students.find((s) => s.id === viewingStudent)?.name || ''}
        student={studentDetails?.student}
        examScores={studentDetails?.examScores || []}
        attendanceRecords={studentDetails?.attendanceRecords || []}
        allExams={studentDetails?.allExams || []}
        allLessons={studentDetails?.allLessons || []}
        loading={detailsLoading && studentDetails?.student.id !== viewingStudent}
        onClose={() => {
          setViewingStudent(null)
          setStudentDetails(null)
        }}
        onRefresh={refreshStudentDetails}
      />
    </div>
  )
}

type Enrollment = NonNullable<Student['enrollments']>[number]

function YearCell({ enrollment }: { enrollment?: Enrollment }) {
  if (!enrollment) return <span className="text-ink-3">Not enrolled</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-2">
      {enrollment.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'}
      {enrollment.isAsyncStudent && <AsyncBadge className="h-[18px] px-1.5 text-[11px]" />}
    </span>
  )
}

function EligibilityBadge({ enrollment, eligible }: { enrollment?: Enrollment; eligible?: boolean }) {
  if (enrollment?.status === 'GRADUATED') return <StatusBadge tone="accent">Graduated</StatusBadge>
  if (enrollment?.status === 'WITHDRAWN') return <StatusBadge tone="neutral">Withdrawn</StatusBadge>
  if (enrollment?.yearLevel === 'YEAR_2' && enrollment.status === 'ACTIVE') {
    return eligible ? <StatusBadge tone="ok">Eligible</StatusBadge> : <StatusBadge tone="warn">Review</StatusBadge>
  }
  return <span className="text-ink-3">—</span>
}

function EnrollmentBadge({ status }: { status: Enrollment['status'] }) {
  const tone: Record<Enrollment['status'], Tone> = { ACTIVE: 'ok', GRADUATED: 'accent', WITHDRAWN: 'neutral' }
  return <StatusBadge tone={tone[status]}>{status === 'ACTIVE' ? 'Active' : status === 'GRADUATED' ? 'Graduated' : 'Withdrawn'}</StatusBadge>
}

export default function StudentsManagementPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentsManagementContent />
    </Suspense>
  )
}
