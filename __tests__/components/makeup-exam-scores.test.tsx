import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeupToday } from '@/lib/makeup-exams'
const mocks = vi.hoisted(() => ({ mutate: vi.fn(), saved: vi.fn(), fetch: vi.fn(), data: { exam: { totalPoints: 100, examSection: { passingScore: 60 } }, students: [{ id: 'student', name: 'Student A', originalPercentage: 50, effectivePercentage: 55, attempts: [{ id: 'attempt', version: 1, score: 55, totalPoints: 100, percentage: 55, takenDate: '2026-10-02T00:00:00Z', notes: null }] }] } }))
vi.mock('@/lib/swr', () => ({ useMakeupExamScores: () => ({ data: mocks.data, mutate: mocks.mutate, isLoading: false, error: null }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { MakeupExamScores } from '@/components/makeup-exam-scores'

describe('makeup grade section', () => {
  beforeEach(() => {
    cleanup(); vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: 'new-attempt' }), { status: 201 }))
    mocks.mutate.mockResolvedValue(undefined); mocks.saved.mockResolvedValue(undefined)
  })
  it('records the selected version through the separate makeup endpoint', async () => {
    const user = userEvent.setup()
    render(<MakeupExamScores examId="exam" canEdit originalUnsaved={false} onSaved={mocks.saved} />)
    expect(screen.getByText('Original: 50.0% · Counts toward progress: 55.0%')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Student'), 'student')
    await user.selectOptions(screen.getByLabelText('Makeup exam version'), '2')
    await user.type(screen.getByLabelText('Makeup score'), '80')
    await user.click(screen.getByRole('button', { name: 'Save makeup score' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    const [url, options] = mocks.fetch.mock.calls[0]
    expect(url).toBe('/api/exams/exam/makeup-scores')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({ studentId: 'student', version: 2, score: 80, totalPoints: 100, takenDate: makeupToday() })
  })
  it('edits the selected attempt rather than adding a duplicate', async () => {
    const user = userEvent.setup()
    render(<MakeupExamScores examId="exam" canEdit originalUnsaved={false} onSaved={mocks.saved} />)
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Makeup exam version')).toHaveValue('1')
    expect(screen.getByLabelText('Student')).toBeDisabled()
    await user.clear(screen.getByLabelText('Makeup score'))
    await user.type(screen.getByLabelText('Makeup score'), '45')
    await user.click(screen.getByRole('button', { name: 'Update makeup score' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(mocks.fetch.mock.calls[0][1].method).toBe('PATCH')
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ attemptId: 'attempt', version: 1, score: 45 })
  })
  it('shows history without write controls for read-only staff', () => {
    render(<MakeupExamScores examId="exam" canEdit={false} originalUnsaved={false} onSaved={mocks.saved} />)
    expect(screen.getByText(/Version 1/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Makeup score')).not.toBeInTheDocument()
  })
  it('prevents a retake save from discarding unsaved original changes', () => {
    render(<MakeupExamScores examId="exam" canEdit originalUnsaved onSaved={mocks.saved} />)
    expect(screen.getByRole('button', { name: 'Save makeup score' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
  })
})
