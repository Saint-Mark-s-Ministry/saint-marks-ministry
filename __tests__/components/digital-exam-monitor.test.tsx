import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DigitalExamView } from '@/lib/digital-exam-types'
const mocks = vi.hoisted(() => ({ data: null as DigitalExamView | null, mutate: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useDigitalExam: () => ({ data: mocks.data, mutate: mocks.mutate }) }))
vi.mock('sonner', () => ({ toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() } }))
import { DigitalExamMonitor } from '@/components/digital-exam-monitor'
const player = { paused: true, currentTime: 0, volume: 1, preload: '', play: vi.fn(), pause: vi.fn() }
afterEach(() => { vi.restoreAllMocks(); cleanup(); vi.unstubAllGlobals() })
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.1)
  player.paused = true; player.currentTime = 0; player.play.mockReset(); player.pause.mockReset()
  player.play.mockImplementation(() => { player.paused = false; return Promise.resolve() })
  player.pause.mockImplementation(() => { player.paused = true })
  vi.stubGlobal('Audio', vi.fn(function () { return player }))
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
describe('compact proctor dashboard', () => {
  it('keeps saved choices and compact interruption logs', () => {
    render(<DigitalExamMonitor examId="exam" />)
    expect(screen.getByRole('button', { name: 'View Test Student: Paused' })).toHaveTextContent('Needs unlock')
    const feed = screen.getByText('Recent saved answers').closest('details')!
    fireEvent.click(screen.getByText('Recent saved answers'))
    expect(within(feed).getByText('Test Student')).toBeInTheDocument()
    expect(within(feed).getByText('Question 12: chose C')).toBeInTheDocument()
    expect(feed).not.toHaveTextContent('Next step:')
    expect(feed).not.toHaveTextContent('Device time')
    fireEvent.click(screen.getByRole('button', { name: 'View Test Student: Paused' }))
    expect(screen.getByText('Answering paused — proctor clearance required')).toBeInTheDocument()
    expect(screen.getAllByText('Exam lost focus').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Unlock student' })).toBeEnabled()
  })
  it('explains why unlocking is unavailable while the page is hidden or contact stale', () => {
    mocks.data!.roster![0].attempt!.pageVisible = false
    const { rerender } = render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'View Test Student: Paused' }))
    expect(screen.getByRole('button', { name: 'Unlock student' })).toBeDisabled()
    expect(screen.getByText(/Waiting for return:/)).toBeInTheDocument()
    mocks.data = structuredClone(mocks.data)
    mocks.data!.roster![0].attempt!.stale = true
    rerender(<DigitalExamMonitor examId="exam" />)
    expect(screen.getByText(/Waiting for contact:/)).toBeInTheDocument()
  })
  it('shows priests the reason and asks a Servants Prep servant to unlock', () => {
    mocks.data!.canManage = false
    render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'View Test Student: Paused' }))
    expect(screen.queryByRole('button', { name: 'Unlock student' })).not.toBeInTheDocument()
    expect(screen.getByText(/Your monitoring access is read-only/)).toBeInTheDocument()
  })
  it('shows a large roster as compact cards and keeps live details current', () => {
    const original = mocks.data!.roster![0]
    mocks.data!.roster = Array.from({ length: 48 }, (_, i) => ({ ...structuredClone(original), student: { id: `student-${i}`, name: `Student ${i + 1}` } }))
    const { rerender } = render(<DigitalExamMonitor examId="exam" />)
    expect(screen.getAllByRole('button', { name: /^View Student/ })).toHaveLength(48)
    expect(screen.queryByText('Answering paused — proctor clearance required')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unlock student' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View Student 24: Paused' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Student 24')
    mocks.data = structuredClone(mocks.data)
    mocks.data!.roster![23].attempt!.state = 'ACTIVE'
    mocks.data!.roster![23].attempt!.answeredCount = 17
    rerender(<DigitalExamMonitor examId="exam" />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Answering · 17/50 answered')
    expect(screen.queryByRole('button', { name: 'Unlock student' })).not.toBeInTheDocument()
  })
  it('opens a screen-sized overview and details without losing the overview', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'Fit to screen' }))
    const overview = screen.getByRole('dialog')
    expect(overview).toHaveTextContent('Student overview · 1')
    fireEvent.click(within(overview).getByRole('button', { name: 'View Test Student: Paused' }))
    const detail = screen.getByRole('dialog', { name: 'Test Student' })
    expect(within(detail).getByRole('button', { name: 'Unlock student' })).toBeEnabled()
    fireEvent.click(within(detail).getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('dialog', { name: 'Student overview · 1' })).toBeInTheDocument()
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

  it('previews the alert sound, alerts on new departures without overlap, and mutes immediately', async () => {
    const { rerender, unmount } = render(<DigitalExamMonitor examId="exam" />)
    expect(player.play).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Enable alert sound' }))
    expect(Audio).toHaveBeenCalledWith('/sounds/egyptian-english-uh-oh.wav')
    expect(player.volume).toBe(1)
    expect(player.play).toHaveBeenCalledTimes(1)
    const addDeparture = (id: string) => {
      mocks.data = structuredClone(mocks.data)
      mocks.data!.roster![0].attempt!.events.push({ id, kind: 'HIDDEN', actorId: 'student', createdAt: '2026-10-09T20:00:20Z', clientAt: null })
      rerender(<DigitalExamMonitor examId="exam" />)
    }
    addDeparture('during-preview')
    expect(player.play).toHaveBeenCalledTimes(1)
    player.paused = true
    vi.mocked(Math.random).mockReturnValue(0.4)
    addDeparture('new-departure')
    await waitFor(() => expect(player.play).toHaveBeenCalledTimes(2))
    expect(player).toHaveProperty('src', '/sounds/egyptian-english-alalalala.wav')
    player.currentTime = 2
    fireEvent.click(screen.getByRole('button', { name: 'Mute alert sound' }))
    expect(player.pause).toHaveBeenCalled()
    expect(player.currentTime).toBe(0)
    addDeparture('muted-departure')
    expect(player.play).toHaveBeenCalledTimes(2)
    unmount()
    expect(player.pause).toHaveBeenCalledTimes(2)
  })
  it('keeps answer changes and already-seen departures silent', () => {
    const { rerender } = render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable alert sound' }))
    player.paused = true
    mocks.data = structuredClone(mocks.data)
    mocks.data!.roster![0].attempt!.events.push({ id: 'new-answer', kind: 'ANSWER_SAVED', actorId: 'student', questionNumber: 13, answerChoice: 'D', createdAt: '2026-10-09T20:00:20Z', clientAt: null })
    rerender(<DigitalExamMonitor examId="exam" />)
    expect(player.play).toHaveBeenCalledTimes(1)
    mocks.data = structuredClone(mocks.data)
    rerender(<DigitalExamMonitor examId="exam" />)
    expect(player.play).toHaveBeenCalledTimes(1)
  })
  it('allows sound to be enabled again if browser playback fails', async () => {
    player.play.mockRejectedValueOnce(new Error('Playback unavailable'))
    render(<DigitalExamMonitor examId="exam" />)
    fireEvent.click(screen.getByRole('button', { name: 'Enable alert sound' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable alert sound' })).toBeInTheDocument())
  })

  it('has no student sound control, including for legacy enabled sheets', () => {
    mocks.data!.sheet!.studentReturnSoundEnabled = true
    render(<DigitalExamMonitor examId="exam" />)
    expect(screen.queryByText(/Student return sound/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /student return sound/i })).not.toBeInTheDocument()
  })
})
