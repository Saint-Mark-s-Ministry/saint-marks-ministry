import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StudentProgramEditor, type EditableStudent } from '@/components/student-program-editor'

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { role: 'SUPER_ADMIN' } } }) }))
vi.mock('swr', () => ({ default: () => ({ data: [] }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const enrollment = {
  id: 'enrollment', studentId: 'student', yearLevel: 'YEAR_1' as const, status: 'ACTIVE' as const,
  academicYearId: null, attendanceStartDate: null, enrolledAt: '2026-01-01',
  mentorId: null, fatherOfConfessionId: null, isAsyncStudent: false, asyncReason: null,
}
const student: EditableStudent = { id: 'student', name: 'Test student', email: 'test@example.invalid', phone: null, profileImageUrl: null, role: 'STUDENT', isDisabled: false, enrollments: [enrollment] }
const fetchMock = vi.fn()

describe('student program attendance mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
  })

  it('shows the year selector for an in-person student', () => {
    render(<StudentProgramEditor student={student} onRefresh={vi.fn()} />)
    expect(screen.getByLabelText('Year level')).toHaveValue('YEAR_1')
  })

  it('shows the submitted mentor separately from the account that controls access', () => {
    render(<StudentProgramEditor student={{ ...student, enrollments: [{
      ...enrollment,
      mentorId: 'old', mentor: { id: 'old', name: 'Marcellino Boles' },
      mentorContact: { name: 'Mina Beshy', email: 'mina@example.com', phone: '222' },
    }] }} onRefresh={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Submitted mentor contact' })).toHaveTextContent('Mina Beshy')
    expect(screen.getByRole('group', { name: 'Submitted mentor contact' })).toHaveTextContent('mina@example.com')
    expect(screen.getByLabelText('Assigned mentor account')).toHaveValue('old')
    expect(screen.getByText(/The submitted mentor is Mina Beshy/)).toBeInTheDocument()
  })

  it('hides the year and requires choosing one when returning to in-person', async () => {
    const onRefresh = vi.fn()
    render(<StudentProgramEditor student={{ ...student, enrollments: [{ ...enrollment, yearLevel: null, isAsyncStudent: true }] }} onRefresh={onRefresh} />)
    expect(screen.queryByLabelText('Year level')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Async student/ }))
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Choose a year to switch to in-person'), { target: { value: 'YEAR_2' } })
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ isAsyncStudent: false, yearLevel: 'YEAR_2' })
  })

  it('enrolls an async student without submitting a cohort year', async () => {
    const onRefresh = vi.fn()
    render(<StudentProgramEditor student={{ ...student, enrollments: [] }} onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enroll as async' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ studentId: 'student', isAsyncStudent: true, isActive: true })
  })
  it('keeps the update badge until review and submits the version the admin read', async () => {
    const renewal = {
      activeYear: { id: 'year', name: '2026-2027' },
      enrollment: { approvalFormUrl: 'https://example.invalid/approval.pdf' },
      information: { mentorName: 'New Mentor', mentorPhone: '555', mentorEmail: 'new@example.invalid', updatedAt: '2026-10-16T18:00:00.000Z', reviewedAt: null },
    }
    const onRefresh = vi.fn()
    const { rerender } = render(<StudentProgramEditor student={{ ...student, annualMentorRequirement: renewal }} onRefresh={onRefresh} />)
    expect(screen.getByText('Update Required')).toBeInTheDocument()
    expect(screen.getByText('Submitted · Awaiting admin review')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View signed approval form' })).toHaveAttribute('href', renewal.enrollment.approvalFormUrl)
    fireEvent.click(screen.getByRole('button', { name: 'Mark mentor information reviewed' }))
    await waitFor(() => expect(onRefresh).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0]).toEqual([
      '/api/students/student/mentor-information/review',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ updatedAt: renewal.information.updatedAt }) }),
    ])
    rerender(<StudentProgramEditor student={{ ...student, annualMentorRequirement: { ...renewal, information: { ...renewal.information, reviewedAt: '2026-10-16T19:00:00Z' } } }} onRefresh={onRefresh} />)
    expect(screen.queryByText('Update Required')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark mentor information reviewed' })).not.toBeInTheDocument()
  })

})
