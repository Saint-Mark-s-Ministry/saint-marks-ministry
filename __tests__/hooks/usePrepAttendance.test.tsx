import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePrepAttendance } from '@/hooks/usePrepAttendance'
import { prepAttendanceDraftKey } from '@/lib/prep-attendance-draft'

const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data })
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
let fetcher: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<ReturnType<typeof response>>>>
const setup = () => renderHook(({ user, lesson, ids, edit }) => usePrepAttendance(user, lesson, ids, edit, true), {
  initialProps: { user: 'staff', lesson: 'lesson', ids: ['a', 'b'], edit: true },
})
const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')
const key = prepAttendanceDraftKey('staff', 'lesson')
beforeEach(() => {
  const memory = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) }, removeItem: (key: string) => { memory.delete(key) } })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  fetcher = vi.fn(async (_url, init) => init?.method === 'POST'
    ? response({ success: true, lastSavedBy: { savedAt: '2026-10-30T12:00:00Z', recorder: { id: 'staff', name: 'Staff' } } })
    : response([]))
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Prep attendance autosave', () => {
  it('automatically saves only edited students, keeps the lesson open, and uses server save attribution', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(posts()).toHaveLength(0)
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    await waitFor(() => expect(result.current.pending).toEqual({}))
    const body = JSON.parse(String(posts()[0][1]?.body))
    expect(body).toMatchObject({ lessonId: 'lesson', expectedUserId: 'staff', finalize: false, records: [{ studentId: 'a', status: 'PRESENT' }] })
    expect(body.records).toHaveLength(1)
    expect(result.current.records.b).toBeUndefined()
    expect(result.current.lastSavedBy?.recorder?.name).toBe('Staff')
    expect(result.current.records.a.status).toBe('PRESENT')
  })

  it('serializes saves and retains a newer status and notes changed during the request', async () => {
    const ack = deferred<ReturnType<typeof response>>()
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? ack.promise : original(url, init))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.save() })
    await waitFor(() => expect(result.current.saving).toBe(true))
    act(() => result.current.mark('a', { status: 'LATE', notes: 'Traffic', arrivedAt: '09:15' }))
    expect(posts()).toHaveLength(1)
    await act(async () => { ack.resolve(response({ success: true })); await saving })
    expect(result.current.pending.a).toMatchObject({ status: 'LATE', notes: 'Traffic', arrivedAt: '09:15' })
    fetcher.mockImplementation(original)
    await act(async () => { await result.current.save() })
    expect(JSON.parse(String(posts()[1][1]?.body)).records[0]).toMatchObject({ status: 'LATE', notes: 'Traffic' })
    expect(result.current.pending).toEqual({})
  })

  it('recovers failed edits after refresh and waits for review before sending', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? Promise.reject(new TypeError('Offline')) : original(url, init))
    const first = setup()
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    act(() => first.result.current.mark('a', { status: 'ABSENT', conductRemoval: true, conductNote: 'Reason' }))
    await act(async () => { await first.result.current.save() })
    expect(first.result.current.saveError).toBe('Offline')
    expect(first.result.current.lastSaved).toBeNull()
    first.unmount()
    fetcher.mockImplementation(original).mockClear()
    const second = setup()
    await waitFor(() => expect(second.result.current.recovered).toBe(true))
    await new Promise(done => setTimeout(done, 700))
    expect(posts()).toHaveLength(0)
    expect(second.result.current.pending.a.conductNote).toBe('Reason')
    await act(async () => { await second.result.current.save() })
    expect(localStorage.getItem(key)).toBeNull()
    expect(second.result.current.pending).toEqual({})
  })

  it('retries on reconnection without marking untouched students absent', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'EXCUSED' }))
    await new Promise(done => setTimeout(done, 700))
    expect(posts()).toHaveLength(0)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(result.current.pending).toEqual({}))
    expect(JSON.parse(String(posts()[0][1]?.body)).records).toHaveLength(1)
  })

  it('ignores old lesson responses and keeps the old lesson draft for recovery', async () => {
    const ack = deferred<ReturnType<typeof response>>()
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? ack.promise : original(url, init))
    const { result, rerender } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    let saving!: Promise<boolean>
    act(() => { saving = result.current.save() })
    await waitFor(() => expect(result.current.saving).toBe(true))
    rerender({ user: 'staff', lesson: 'other', ids: ['a', 'b'], edit: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { ack.resolve(response({ success: true, lastSavedBy: { savedAt: '2026-10-30T12:00:00Z', recorder: null } })); await saving })
    expect(result.current.lastSavedBy).toBeNull()
    expect(result.current.records).toEqual({})
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('isolates account drafts and does not recover students removed from the roster', async () => {
    localStorage.setItem(key, JSON.stringify([{ studentId: 'a', status: 'PRESENT' }, { studentId: 'removed', status: 'ABSENT' }]))
    const { result, rerender } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(Object.keys(result.current.pending)).toEqual(['a'])
    rerender({ user: 'other-staff', lesson: 'lesson', ids: ['a', 'b'], edit: true })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pending).toEqual({})
    act(() => result.current.mark('b', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(JSON.parse(String(posts()[0][1]?.body)).expectedUserId).toBe('other-staff')
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('adds absences only on Finish, preserves the exact failed final submission, and permits retry', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? Promise.reject(new TypeError('Lost response')) : original(url, init))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save(['a', 'b']) })
    expect(result.current.pending.b.status).toBe('ABSENT')
    expect(JSON.parse(String(posts()[0][1]?.body)).finalize).toBe(true)
    fetcher.mockImplementation(original)
    await act(async () => { await result.current.save() })
    expect(JSON.parse(String(posts()[1][1]?.body)).records).toEqual(JSON.parse(String(posts()[0][1]?.body)).records)
    expect(result.current.pending).toEqual({})
  })

  it('drops stale writes excluded by the server after withdrawal or async approval', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? Promise.resolve(response({ success: true, skippedStudentIds: ['a'] })) : original(url, init))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(result.current.pending).toEqual({})
    expect(result.current.records.a).toBeUndefined()
    expect(result.current.excludedIds).toEqual(['a'])
    act(() => result.current.mark('a', { status: 'ABSENT' }))
    expect(result.current.pending).toEqual({})
  })

  it('blocks editing on load failure or when another tab owns the lesson', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn(async (_key, _opts, callback) => callback(null)) } })
    const { result } = setup()
    await waitFor(() => expect(result.current.error).toMatch(/another tab/))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not acknowledge unsuccessful or malformed save responses', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? Promise.resolve(response({ error: 'Forbidden' }, 403)) : original(url, init))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(result.current.pending.a.status).toBe('PRESENT')
    expect(result.current.retryable).toBe(false)
    expect(result.current.lastSaved).toBeNull()
    expect(localStorage.getItem(key)).not.toBeNull()
  })
  it('warns on unavailable draft storage and retains edits in memory on reload', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota') })
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    expect(result.current.storageError).toBe(true)
    const event = new Event('beforeunload', { cancelable: true })
    act(() => { window.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
    act(() => result.current.retryLoad())
    await waitFor(() => expect(result.current.recovered).toBe(true))
    expect(result.current.pending.a.status).toBe('PRESENT')
  })

  it('blocks changes when attendance cannot load', async () => {
    fetcher.mockResolvedValue(response({ error: 'Forbidden' }, 403))
    const { result } = setup()
    await waitFor(() => expect(result.current.error).toBe('Forbidden'))
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(posts()).toHaveLength(0)
  })

  it('keeps read-only viewing free of draft restoration and writes', async () => {
    localStorage.setItem(key, JSON.stringify([{ studentId: 'a', status: 'ABSENT' }]))
    const { result } = renderHook(() => usePrepAttendance('staff', 'lesson', ['a', 'b'], false, true))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pending).toEqual({})
    act(() => result.current.mark('a', { status: 'PRESENT' }))
    await act(async () => { await result.current.save() })
    expect(posts()).toHaveLength(0)
    expect(localStorage.getItem(key)).not.toBeNull()
  })

  it('keeps Finish open for review when enrollment changed during the save', async () => {
    const original = fetcher.getMockImplementation()!
    fetcher.mockImplementation((url, init) => init?.method === 'POST' ? Promise.resolve(response({ success: true, skippedStudentIds: ['a'] })) : original(url, init))
    const { result } = setup()
    await waitFor(() => expect(result.current.loading).toBe(false))
    let finished: boolean | undefined
    await act(async () => { finished = await result.current.save(['a', 'b']) })
    expect(finished).toBe(false)
    expect(result.current.excludedIds).toEqual(['a'])
    expect(result.current.records.b.status).toBe('ABSENT')
  })

})
