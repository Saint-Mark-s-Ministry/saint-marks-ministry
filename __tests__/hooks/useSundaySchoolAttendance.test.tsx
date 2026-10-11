import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendanceStatus, SundaySchoolLevel } from '@prisma/client'
import { useSundaySchoolAttendance } from '@/hooks/useSundaySchoolAttendance'
import { attendanceDraftKey } from '@/lib/sunday-school-attendance-draft'

const key = attendanceDraftKey('user', 'class', '2026-10-10')
let failSave: boolean
let fetcher: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<ReturnType<typeof response>>>>
let roster: { id: string; firstName: string; lastName: string; level: SundaySchoolLevel }[]
const response = (data: unknown) => ({ ok: true, json: async () => data })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const setup = () => renderHook(({ user, cls, date, edit }) => useSundaySchoolAttendance(user, cls, date, edit), {
  initialProps: { user: 'user', cls: 'class', date: '2026-10-10', edit: true },
})
beforeEach(() => {
  const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) },
    })
  failSave = false
  roster = [{ id: 'child', firstName: 'Mina', lastName: 'Mark', level: SundaySchoolLevel.GRADE_5 },
    { id: 'other', firstName: 'Mary', lastName: 'Mark', level: SundaySchoolLevel.GRADE_5 }]
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.startsWith('/api/sunday-school/sessions?')) return response([])
    if (url.startsWith('/api/sunday-school/children?')) return response(roster)
    if (failSave) throw new TypeError('Connection lost')
    if (url === '/api/sunday-school/sessions') return response({ id: 'session' })
    return response({ success: true })
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('attendance recovery and autosave', () => {
  it('persists every tap synchronously, autosaves only marked children, and clears only acknowledged marks', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ child: 'PRESENT' })
    const ack = deferred<ReturnType<typeof response>>()
    fetcher.mockImplementation(async (url: string) => url === '/api/sunday-school/attendance/batch' ? ack.promise : response({ id: 'session' }))
    await waitFor(() => expect(result.current.saving).toBe(true))
    act(() => result.current.mark('child', AttendanceStatus.LATE))
    ack.resolve(response({ success: true }))
    await waitFor(() => expect(result.current.saving).toBe(false))
    expect(result.current.pending).toEqual({ child: 'LATE' })
    const batch = fetcher.mock.calls.find(([url]) => url === '/api/sunday-school/attendance/batch')!
    expect(JSON.parse(String(batch[1]!.body))).toEqual({ sessionId: 'session', expectedUserId: 'user', records: [{ childId: 'child', status: 'PRESENT' }] })
    expect(result.current.marks.other).toBeUndefined()
  })

  it('keeps failed saves across refresh, recovers after roster validation, and requires review before retry', async () => {
    failSave = true
    const first = setup()
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    act(() => first.result.current.mark('child', AttendanceStatus.PRESENT))
    await act(async () => { await first.result.current.save(false) })
    expect(first.result.current.saveError).toBe('Connection lost')
    expect(first.result.current.lastSaved).toBeNull()
    first.unmount()
    failSave = false
    fetcher.mockClear()
    const second = setup()
    await waitFor(() => expect(second.result.current.recovered).toBe(true))
    expect(second.result.current.marks.child).toBe('PRESENT')
    await new Promise(done => setTimeout(done, 700))
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    await act(async () => { await second.result.current.save(false) })
    expect(second.result.current.pending).toEqual({})
    expect(localStorage.getItem(key)).toBeNull()
    expect(second.result.current.lastSaved).toBeInstanceOf(Date)
  })

  it('retries pending marks on reconnection while the same roster remains open', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    await new Promise(done => setTimeout(done, 700))
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(result.current.lastSaved).not.toBeNull())
    expect(result.current.pending).toEqual({})
  })

  it.each([
    { user: 'other-user', cls: 'class', date: '2026-10-10', edit: true },
    { user: 'user', cls: 'other-class', date: '2026-10-10', edit: true },
    { user: 'user', cls: 'class', date: '2026-10-03', edit: true },
    { user: 'user', cls: 'class', date: '2026-10-10', edit: false },
  ])('never restores or sends a draft outside its writable user/class/date scope: %j', async props => {
    localStorage.setItem(key, JSON.stringify({ child: 'PRESENT' }))
    const { result, rerender } = setup()
    await waitFor(() => expect(result.current.recovered).toBe(true))
    rerender(props)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.marks).toEqual({})
    await act(async () => { if (!props.edit) await result.current.save() })
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('excludes removed children, preserves added children as unmarked, and finalizes only the fresh roster', async () => {
    localStorage.setItem(key, JSON.stringify({ removed: 'PRESENT', child: 'LATE' }))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.removedCount).toBe(1)
    expect(result.current.pending).toEqual({ child: 'LATE' })
    expect(result.current.marks.other).toBeUndefined()
    await act(async () => { await result.current.save() })
    const batch = fetcher.mock.calls.find(([url]) => url === '/api/sunday-school/attendance/batch')!
    expect(JSON.parse(String(batch[1]!.body)).records).toEqual([{ childId: 'child', status: 'LATE' }, { childId: 'other', status: 'ABSENT' }])
  })

  it('ignores stale roster responses after changing class', async () => {
    const old = deferred<ReturnType<typeof response>>()
    fetcher.mockImplementationOnce(() => old.promise)
    const { result, rerender } = setup()
    rerender({ user: 'user', cls: 'new-class', date: '2026-10-10', edit: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('child', AttendanceStatus.LATE))
    old.resolve(response([{ id: 'old-session' }]))
    await act(async () => { await old.promise })
    expect(result.current.marks.child).toBe('LATE')
    expect(fetcher.mock.calls.some(([url]) => url.includes('old-session'))).toBe(false)
  })

  it('does not issue the second write after switching user during session creation', async () => {
    const opened = deferred<ReturnType<typeof response>>()
    const { result, rerender } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    fetcher.mockImplementationOnce(() => opened.promise)
    let saving!: Promise<boolean>
    act(() => { saving = result.current.save() })
    rerender({ user: 'new-user', cls: 'class', date: '2026-10-10', edit: true })
    opened.resolve(response({ id: 'old-session' }))
    await act(async () => { await saving })
    expect(fetcher.mock.calls.some(([url]) => url === '/api/sunday-school/attendance/batch')).toBe(false)
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('reports unavailable storage while preserving in-memory marks and recovering them on retry', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    expect(result.current.storageError).toBe(true)
    expect(result.current.pending.child).toBe('PRESENT')
    act(() => result.current.retryLoad())
    await waitFor(() => expect(result.current.recovered).toBe(true))
    expect(result.current.marks.child).toBe('PRESENT')
  })

  it('blocks editing when the same draft is owned by another browser tab', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: {
      request: vi.fn(async (_name, _options, callback) => callback(null)),
    } })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toMatch(/another tab/)
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    await act(async () => { await result.current.save() })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('keeps memory drafts even if a roster reload fails while storage is unavailable', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded') })
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    fetcher.mockImplementationOnce(async () => { throw new TypeError('Offline') })
    act(() => result.current.retryLoad())
    await waitFor(() => expect(result.current.error).toBe('Offline'))
    act(() => result.current.retryLoad())
    await waitFor(() => expect(result.current.recovered).toBe(true))
    expect(result.current.pending.child).toBe('PRESENT')
  })

  it('retains the exact finalized submission when the attendance acknowledgment is lost', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('child', AttendanceStatus.PRESENT))
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation(async (url, init) => {
      if (url === '/api/sunday-school/attendance/batch') throw new TypeError('Lost acknowledgment')
      return original(url, init)
    })
    await act(async () => { await result.current.save() })
    expect(result.current.lastSaved).toBeNull()
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ child: 'PRESENT', other: 'ABSENT' })
    fetcher.mockImplementation(original)
    await act(async () => { await result.current.save(false) })
    const batches = fetcher.mock.calls.filter(([url]) => url === '/api/sunday-school/attendance/batch')
    expect(JSON.parse(String(batches[0][1]!.body)).records).toEqual(JSON.parse(String(batches[1][1]!.body)).records)
    expect(localStorage.getItem(key)).toBeNull()
  })

  it('handles corrupt storage without hiding the server roster', async () => {
    localStorage.setItem(key, '{bad-json')
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.storageError).toBe(true)
    expect(result.current.attendance?.roster).toHaveLength(2)
  })
})
