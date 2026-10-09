import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DigitalExamView } from '@/lib/digital-exam-types'
const mocks = vi.hoisted(() => ({ data: null as DigitalExamView | null, mutate: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useDigitalExam: () => ({ data: mocks.data, mutate: mocks.mutate }) }))
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }))
import { DigitalExamMonitor } from '@/components/digital-exam-monitor'
beforeEach(() => {
  mocks.data = {
    exam: { id: 'exam', examDate: '2026-07-17', yearLevel: 'BOTH', totalPoints: 100, academicYear: { name: '2025-2026' }, examSection: { displayName: 'Comparative Theology' } },
    sheet: { state: 'OPEN', choiceCounts: Array(50).fill(4), openedAt: '2026-10-09T20:00:00Z', closedAt: null, releasedAt: null },
    canManage: true, hasAttempts: true,
    roster: [{ student: { id: 'student', name: 'Test Student' }, eligible: true, attempt: { id: 'attempt', state: 'PAUSED', answers: Array(50).fill(''), revision: 2, startedAt: '2026-10-09T20:00:00Z', lastSeenAt: '2026-10-09T20:00:10Z', pausedAt: '2026-10-09T20:00:05Z', submittedAt: null, stale: false, pageVisible: true, answeredCount: 1, events: [
      { id: 'answer', kind: 'ANSWER_SAVED', actorId: 'student', createdAt: '2026-10-09T20:00:02Z', clientAt: null, questionNumber: 12, answerChoice: 'C' },
      { id: 'blur', kind: 'BLUR', actorId: 'student', createdAt: '2026-10-09T20:00:05Z', clientAt: '2026-10-09T20:00:04Z' },
    ] } }],
  }
})
describe('detailed proctor dashboard', () => {
  it('shows saved answer details separately from interruption guidance', () => {
    render(<DigitalExamMonitor examId="exam" />)
    const feed = screen.getByRole('heading', { name: 'Recent saved answers' }).closest('section')!
    expect(within(feed).getByText('Test Student')).toBeInTheDocument()
    expect(within(feed).getByText('Question 12: saved C')).toBeInTheDocument()
    expect(feed).toHaveTextContent('not a correctness check')
    expect(screen.getByText('Answering paused — proctor clearance required')).toBeInTheDocument()
    expect(screen.getAllByText(/cannot confirm a text reply/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Unlock student' })).toBeEnabled()
  })
  it('explains why unlocking is unavailable while the page is hidden or contact stale', () => {
    mocks.data!.roster![0].attempt!.pageVisible = false
    const { rerender } = render(<DigitalExamMonitor examId="exam" />)
    expect(screen.getByRole('button', { name: 'Unlock student' })).toBeDisabled()
    expect(screen.getByText(/Waiting for return:/)).toBeInTheDocument()
    mocks.data = structuredClone(mocks.data)
    mocks.data!.roster![0].attempt!.stale = true
    rerender(<DigitalExamMonitor examId="exam" />)
    expect(screen.getByText(/Waiting for contact:/)).toBeInTheDocument()
  })
  it('shows priests the reason and asks an exam leader to unlock', () => {
    mocks.data!.canManage = false
    render(<DigitalExamMonitor examId="exam" />)
    expect(screen.queryByRole('button', { name: 'Unlock student' })).not.toBeInTheDocument()
    expect(screen.getByText(/Your monitoring access is read-only/)).toBeInTheDocument()
  })
  it('offers an explicit individual retake and ready-to-open confirmation', () => {
    mocks.data!.retakeCandidates = [{ id: 'student', name: 'Test Student' }]
    render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'Allow retake' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('A lower score never reduces the existing grade')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set ready to open' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Locked choices, the answer key, grades, submissions and retake approvals are preserved')
  })

})
