import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({ guard: vi.fn(), details: vi.fn(), session: vi.fn(), serving: vi.fn(), mutate: vi.fn(), router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/admin/students', useRouter: () => mocks.router }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: mocks.guard }))
vi.mock('next-auth/react', () => ({ useSession: mocks.session }))
vi.mock('@/lib/swr', () => ({ useStudentDetails: mocks.details, useStudentServingProgress: mocks.serving }))
vi.mock('@/components/student-program-editor', () => ({ StudentProgramEditor: () => <div>Program information</div> }))
vi.mock('@/components/admin/confession-tracker', () => ({ ConfessionTracker: () => <div>Confession records</div> }))
vi.mock('@/components/admin/attendance-slips-panel', () => ({ AttendanceSlipsPanel: () => <div>Attendance slips</div> }))

import { NavigationTransition } from '@/components/navigation-transition'
import { StudentProfileModal } from '@/components/student-profile-modal'
import { PersonCell } from '@/components/ds/person'
import { StudentProfileProvider } from '@/components/student-profile-provider'
import { StudentProfileLink } from '@/components/student-profile-link'
import { StudentServingHistory } from '@/components/student-serving-history'

const lesson = { id: 'lesson', title: 'Lesson', scheduledDate: '2026-10-10T00:00:00Z', examSection: { id: 'section', name: 'DOGMA', displayName: 'Dogma' } }
const data = {
  student: { id: 'nori', name: 'Nori Bhojwani', email: 'nori@example.com', enrollments: [{ id: 'enrollment', studentId: 'nori', status: 'ACTIVE', yearLevel: 'YEAR_2', isAsyncStudent: false }] },
  examScores: [{ id: 'score', score: 76, percentage: 76, exam: { id: 'exam', totalPoints: 100, examDate: '2026-05-22T00:00:00Z', examSection: lesson.examSection } }],
  attendanceRecords: [
    { id: 'present', status: 'PRESENT', lesson },
    { id: 'late', status: 'LATE', lesson },
    { id: 'excused', status: 'EXCUSED', lesson },
    { id: 'exam-day', status: 'ABSENT', lesson: { ...lesson, isExamDay: true } },
  ],
  allExams: [], allLessons: [],
}

async function showProfile() {
  await act(async () => { render(<StudentProfileModal studentId="nori" onClose={() => {}} />) })
}

describe('SP student profile', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const session = { user: { id: 'admin', role: UserRole.SUPER_ADMIN } }
    mocks.guard.mockReturnValue({ session, status: 'authenticated' })
    mocks.session.mockReturnValue({ data: session })
    mocks.details.mockReturnValue({ data, isLoading: false, mutate: mocks.mutate })
    mocks.serving.mockReturnValue({ data: { assignments: [] }, isLoading: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
  })

  it('opens a permanent profile link without expanding a containing student row', () => {
    const expand = vi.fn()
    render(<div onClick={expand}><StudentProfileLink studentId="nori">Nori Bhojwani</StudentProfileLink></div>)
    const link = screen.getByRole('link', { name: 'Nori Bhojwani' })
    link.addEventListener('click', event => event.preventDefault())
    expect(link).toHaveAttribute('href', '/dashboard/admin/students/nori')
    fireEvent.click(link)
    expect(expand).not.toHaveBeenCalled()
  })

  it('shows the complete profile in a modal and calculates attendance excluding excused records and exam days', async () => {
    await showProfile()
    expect(screen.getByRole('heading', { name: /Nori Bhojwani - Details/ })).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Exams' }), { button: 0, ctrlKey: false })
    expect(screen.getAllByText('76.00%').length).toBeGreaterThan(0)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Attendance' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('75.0%')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    for (const name of ['Profile', 'Exams', 'Attendance', 'Confession']) expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Notes' })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalledWith('/api/students/nori/notes')
    expect(screen.queryByRole('tab', { name: 'Serving' })).not.toBeInTheDocument()
    expect(mocks.details).toHaveBeenCalledWith('nori')
  })

  it('only shows Serving for an async student', async () => {
    mocks.details.mockReturnValue({ data: { ...data, student: { ...data.student, enrollments: [{ ...data.student.enrollments[0], isAsyncStudent: true, yearLevel: null }] } }, isLoading: false })
    await showProfile()
    expect(screen.getByRole('tab', { name: 'Serving' })).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Serving' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('SP serving requirement')).toBeInTheDocument()
  })

  it.each(['name link', 'person cell'])('opens a %s above the list and preserves filters and focus on close', async kind => {
    window.history.replaceState({}, '', '/dashboard/admin/students')
    render(<><NavigationTransition /><StudentProfileProvider>
      <input aria-label="Search students" defaultValue="Nori" />
      {kind === 'person cell' ? <PersonCell name="Nori Bhojwani" href="/dashboard/admin/students/nori" /> : <StudentProfileLink studentId="nori">Nori Bhojwani</StudentProfileLink>}
    </StudentProfileProvider></>)
    const opener = screen.getByRole('link', { name: 'Nori Bhojwani' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.router.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Search students' })).toHaveValue('Nori')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(mocks.router.push).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/dashboard/admin/students')
  })

  it('does not fetch student data for a Sunday School-only user', async () => {
    mocks.guard.mockReturnValue({ session: { user: { role: UserRole.SERVANT } }, status: 'authenticated' })
    await showProfile()
    expect(mocks.details).toHaveBeenCalledWith(undefined)
    expect(screen.queryByRole('heading', { name: 'Nori Bhojwani' })).not.toBeInTheDocument()
  })

  it('shows a missing student message instead of an empty editable profile', async () => {
    mocks.details.mockReturnValue({ error: { status: 404 }, isLoading: false })
    await showProfile()
    expect(screen.getByRole('alert')).toHaveTextContent('Student not found')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('offers a retry for a failed request', async () => {
    mocks.details.mockReturnValue({ error: { status: 500 }, isLoading: false, mutate: mocks.mutate })
    await showProfile()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it('shows missing records without treating an ungraded student as failing', async () => {
    mocks.details.mockReturnValue({ data: { ...data, examScores: [], attendanceRecords: [] }, isLoading: false })
    await showProfile()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Exams' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('No scores')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Attendance' }), { button: 0, ctrlKey: false })
    expect(screen.getByText('No records')).toBeInTheDocument()
  })

  it('keeps priests read-only in the profile, exams, and attendance tabs', async () => {
    mocks.session.mockReturnValue({ data: { user: { id: 'priest', role: UserRole.PRIEST } } })
    mocks.guard.mockReturnValue({ session: { user: { id: 'priest', role: UserRole.PRIEST } }, status: 'authenticated' })
    await showProfile()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    for (const name of ['Exams', 'Attendance']) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false })
      expect(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
      expect(within(screen.getByRole('tabpanel')).queryByRole('button')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('Write a note about this student...')).not.toBeInTheDocument()
    }
  })
})

describe('student serving history', () => {
  it('scopes the history to the student and shows dated weekly verification and notes', () => {
    mocks.serving.mockReturnValue({ data: { assignments: [{
      assignmentId: 'serving', gradeDisplayName: '1st Grade', yearLevel: 'YEAR_2', academicYear: { name: '2026-2027' },
      totalWeeks: 6, isActive: true, attendance: { present: 5, percentage: 83.333, met: true },
      weekBreakdown: [{ weekNumber: 1, weekOf: '2026-10-17T00:00:00Z', status: 'VERIFIED', notes: 'Confirmed', studentNotes: 'Helped with lesson' }],
    }] }, isLoading: false })
    render(<StudentServingHistory studentId="nori" />)
    expect(mocks.serving).toHaveBeenCalledWith('nori')
    expect(screen.getByText('Verified')).toBeInTheDocument()
    expect(screen.getByText(/Oct 17, 2026/)).toBeInTheDocument()
    expect(screen.getByText(/83.3%/)).toBeInTheDocument()
    expect(screen.getByText('Staff: Confirmed')).toBeInTheDocument()
    expect(screen.getByText('Student: Helped with lesson')).toBeInTheDocument()
  })

  it('distinguishes a failed serving request from an empty history', () => {
    mocks.serving.mockReturnValue({ error: new Error('Failed'), mutate: mocks.mutate })
    render(<StudentServingHistory studentId="nori" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load serving history')
    expect(screen.queryByText('No serving assignments recorded.')).not.toBeInTheDocument()
  })
})
