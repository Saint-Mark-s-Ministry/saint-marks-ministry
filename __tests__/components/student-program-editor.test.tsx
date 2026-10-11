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
})
