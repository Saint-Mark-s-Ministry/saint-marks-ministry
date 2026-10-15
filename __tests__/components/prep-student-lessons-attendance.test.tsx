import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ async: true }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({
  status: 'authenticated', session: { user: { id: 'student' } },
}) }))
import StudentLessonsPage from '@/app/dashboard/student/lessons/page'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [2, 9].map(day => ({
    id: `lesson-${day}`, title: `October ${day} lesson`, scheduledDate: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`,
    lessonNumber: day, status: 'COMPLETED', asyncPeriod: mocks.async,
    examSection: { id: 'section', displayName: 'Bible Studies' }, academicYear: { isActive: true },
    resources: [{ id: 'notes', title: 'Lesson notes', url: 'https://example.com/notes' }],
    // Async badges must override even a stale legacy record.
    attendance: { id: `record-${day}`, status: 'ABSENT' },
  })) })))
})

describe('My lessons async attendance', () => {
  it('shows Oct 2 and Oct 9 as rotation attendance rather than absences and keeps resources', async () => {
    mocks.async = true
    render(<StudentLessonsPage />)
    const lesson = await screen.findByRole('button', { name: /October 2 lesson/ })
    expect(within(lesson).getByText('Async · rotation')).toBeInTheDocument()
    expect(screen.getAllByText('Async · rotation')).toHaveLength(2)
    expect(screen.queryByText('Absent')).not.toBeInTheDocument()
    expect(screen.getByText('N/A')).toBeInTheDocument()
    fireEvent.click(lesson)
    expect(screen.getByRole('link', { name: /Lesson notes/ })).toHaveAttribute('href', 'https://example.com/notes')
    expect(screen.getAllByText('Async · rotation')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Attendance' }), { target: { value: 'absent' } })
    expect(screen.queryByRole('button', { name: /October 2 lesson/ })).not.toBeInTheDocument()
    expect(screen.getByText('No lessons match.')).toBeInTheDocument()
  })

  it('preserves real absences for in-person students', async () => {
    mocks.async = false
    render(<StudentLessonsPage />)
    await screen.findByRole('button', { name: /October 2 lesson/ })
    expect(screen.getAllByText('Absent')).toHaveLength(2)
    expect(screen.queryByText('Async · rotation')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Attendance' }), { target: { value: 'absent' } })
    expect(screen.getByRole('button', { name: /October 2 lesson/ })).toBeInTheDocument()
  })
})
