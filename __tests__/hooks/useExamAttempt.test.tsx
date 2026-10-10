import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExamAttempt } from '@/hooks/useExamAttempt'
import type { DigitalExamView, ExamAttemptView } from '@/lib/digital-exam-types'
const sound = vi.hoisted(() => ({ arm: vi.fn(), play: vi.fn(), stop: vi.fn(), dispose: vi.fn() }))
vi.mock('@/lib/exam-return-audio', () => ({ createExamReturnAudio: () => sound }))
const view: DigitalExamView = { exam: { id: 'exam', examDate: '', yearLevel: 'YEAR_1', totalPoints: 100, examSection: { displayName: 'Bible' }, academicYear: { name: 'Year' } }, sheet: { studentReturnSoundEnabled: true, state: 'OPEN', choiceCounts: Array(50).fill(4), openedAt: '', closedAt: null, releasedAt: null } }
let stored: ExamAttemptView
let eventLog: { kind: string; id: string }[]
let online: boolean
let hidden: boolean
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks(); sound.play.mockResolvedValue(true)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const memoryStorage = () => { const map = new Map<string, string>(); return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => map.set(key, value), clear: () => map.clear(), removeItem: (key: string) => map.delete(key) } }
  vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage())
  online = true; hidden = false; eventLog = []
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  stored = { id: 'attempt', state: 'ACTIVE', answers: Array(50).fill(''), revision: 0, startedAt: '', lastSeenAt: '', pausedAt: null, submittedAt: null }
  fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body))
    if (!online) throw new TypeError('Network unavailable')
    if (body.action === 'events') { eventLog.push(...body.events); if (body.events.some((e: { kind: string }) => ['HIDDEN','BLUR','OFFLINE','RECONNECTED','SITE_NAVIGATION'].includes(e.kind))) stored = { ...stored, state: 'PAUSED', revision: stored.revision + 1 } }
    if (body.action === 'save' && stored.state === 'ACTIVE') { const answers = [...stored.answers]; answers[body.question] = body.answer; stored = { ...stored, answers, revision: stored.revision + 1 } }
    if (body.action === 'submit') stored = { ...stored, state: 'SUBMITTED', revision: stored.revision + 1, submittedAt: '2026-10-09T20:00:00Z' }
    return { ok: true, json: async () => ({ attempt: structuredClone(stored), examState: 'OPEN' }) }
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('exam browser controls', () => {
  it('autosaves an answer and clears its pending draft only after acknowledgment', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    act(() => result.current.choose(4, 'C'))
    await waitFor(() => expect(result.current.pendingCount).toBe(0))
    expect(result.current.answers[4]).toBe('C')
    expect(fetcher.mock.calls.some(([, init]) => JSON.parse(String(init.body)).action === 'save')).toBe(true)
  })
  it('pauses immediately on hidden visibility and records return without unlocking', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.paused).toBe(true)
    act(() => result.current.choose(0, 'A'))
    expect(result.current.answers[0]).toBe('')
    await waitFor(() => expect(eventLog.some(e => e.kind === 'HIDDEN')).toBe(true))
    await act(async () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')) })
    expect(result.current.paused).toBe(true)
  })
  it('pauses immediately on window focus loss and requires clearance after returning', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    act(() => window.dispatchEvent(new Event('blur')))
    expect(result.current.paused).toBe(true)
    act(() => result.current.choose(0, 'A'))
    expect(result.current.answers[0]).toBe('')
    await waitFor(() => expect(eventLog.some(e => e.kind === 'BLUR')).toBe(true))
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(eventLog.some(e => e.kind === 'FOCUS')).toBe(true)
    expect(result.current.paused).toBe(true)
  })
  it('reports internal page navigation and keeps the report for recovery', async () => {
    window.history.replaceState(null, '', '/dashboard/student/exams/exam')
    const { result, unmount } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    window.history.pushState(null, '', '/dashboard/files?private=ignored')
    unmount()
    await waitFor(() => expect(eventLog.some(e => e.kind === 'SITE_NAVIGATION')).toBe(true))
    const saved = JSON.parse(localStorage.getItem('digital-exam:student:exam')!)
    expect(saved.events.find((e: { kind: string }) => e.kind === 'SITE_NAVIGATION').destinationPath).toBe('/dashboard/files')
    expect(stored.state).toBe('PAUSED')
    window.history.replaceState(null, '', '/')
  })
  it('preserves queued answers on connection loss and requires clearance on recovery', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    fetcher.mockImplementationOnce(async () => { throw new TypeError('Lost connection') })
    await act(async () => result.current.choose(2, 'B'))
    expect(result.current.pendingCount).toBe(1)
    expect(result.current.paused).toBe(true)
    const saved = JSON.parse(localStorage.getItem('digital-exam:student:exam')!)
    expect(saved.answers['2']).toBe('B')
    expect([...saved.events, ...eventLog].some((e: { kind: string }) => e.kind === 'OFFLINE')).toBe(true)
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(result.current.paused).toBe(true)
  })
  it('clears local drafts after final submission', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    await act(async () => result.current.submit())
    expect(result.current.attempt?.state).toBe('SUBMITTED')
    act(() => result.current.choose(0, 'A'))
    expect(result.current.answers[0]).toBe('')
    expect(JSON.parse(localStorage.getItem('digital-exam:student:exam')!).answers).toEqual({})
  })
  it('discards pending answers and events from an earlier attempt version before starting a retake', async () => {
    localStorage.setItem('digital-exam:student:exam', JSON.stringify({ answers: { '0': 'E' }, events: [{ id: crypto.randomUUID(), kind: 'HIDDEN', at: new Date().toISOString() }] }))
    stored = { ...stored, attemptNumber: 2, revision: 4 }
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    expect(result.current.answers[0]).toBe('')
    expect(result.current.pendingCount).toBe(0)
    expect(eventLog).toEqual([])
    expect(result.current.paused).toBe(false)
  })

  it('returns an existing browser session to the start screen when a leader approves a new version', async () => {
    stored = { ...stored, attemptNumber: 1, state: 'SUBMITTED' }
    const { result, rerender } = renderHook(({ examView }) => useExamAttempt('exam', 'student', examView), { initialProps: { examView: view } })
    await act(async () => result.current.start())
    expect(result.current.started).toBe(true)
    const approved = { ...stored, state: 'PAUSED' as const, attemptNumber: 2, retakeReady: true, revision: 1 }
    rerender({ examView: { ...view, attempt: approved } })
    await waitFor(() => expect(result.current.started).toBe(false))
    expect(result.current.answers.every(answer => answer === '')).toBe(true)
  })

  it('keeps student devices silent on departure and return even with a legacy enabled setting', async () => {
    const { result } = renderHook(() => useExamAttempt('exam', 'student', view))
    await act(async () => result.current.start())
    await act(async () => { hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')) })
    await act(async () => { hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')) })
    expect(sound.arm).not.toHaveBeenCalled()
    expect(sound.play).not.toHaveBeenCalled()
    expect(result.current.paused).toBe(true)
  })
})
