import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DigitalExamList } from '@/lib/digital-exam-types'
const mocks = vi.hoisted(() => ({ role: 'SERVANT_PREP', data: { exams: [] } as DigitalExamList, error: null as Error | null, loading: false }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ status: 'authenticated', session: { user: { role: mocks.role } } }) }))
vi.mock('@/lib/swr', () => ({ useDigitalExams: () => ({ data: mocks.data, error: mocks.error, isLoading: mocks.loading, mutate: vi.fn() }) }))
import ExamMonitoringPage from '@/app/dashboard/admin/exam-monitoring/page'
const exam = (id: string, name: string, state: string | null): DigitalExamList['exams'][number] => ({ id, examDate: '2026-07-17T00:00:00.000Z', yearLevel: 'BOTH', totalPoints: 100, examSection: { displayName: name }, academicYear: { name: '2025-2026' }, digitalSheet: state ? { state, releasedAt: null, attempts: [] } : null })
describe('Exam Monitoring', () => {
  beforeEach(() => { mocks.role = 'SERVANT_PREP'; mocks.error = null; mocks.loading = false; mocks.data = { exams: [exam('draft', 'Comparative Theology', 'DRAFT'), exam('open', 'Dogma', 'OPEN'), exam('paper', 'Bible Studies', null)] } })
  it('prioritizes open exams and links to the correct live dashboard', () => {
    render(<ExamMonitoringPage />)
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Dogma')
    expect(screen.getByRole('link', { name: 'Monitor Dogma exam' })).toHaveAttribute('href', '/dashboard/admin/exams/open/monitor')
    expect(screen.getByRole('link', { name: 'Set up Bible Studies exam' })).toHaveAttribute('href', '/dashboard/admin/exams/paper/monitor')
  })
  it('filters by status and searches academic year or exam name', async () => {
    const user = userEvent.setup(); render(<ExamMonitoringPage />)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Proctoring status' }), 'DRAFT')
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent('Comparative Theology')
    await user.type(screen.getByRole('searchbox', { name: 'Search exams' }), '2025-2026')
    expect(screen.getByRole('listitem')).toHaveTextContent('Comparative Theology')
    await user.clear(screen.getByRole('searchbox')); await user.type(screen.getByRole('searchbox'), 'Dogma')
    expect(screen.getByText('No exams match your filters.')).toBeInTheDocument()
  })
  it('gives priests viewing instructions and excludes students', () => {
    mocks.role = 'PRIEST'; const { rerender } = render(<ExamMonitoringPage />)
    expect(screen.getByText('View proctoring')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Set up/ })).not.toBeInTheDocument()
    mocks.role = 'STUDENT'; rerender(<ExamMonitoringPage />)
    expect(screen.queryByText('Exam Monitoring')).not.toBeInTheDocument()
  })
})
