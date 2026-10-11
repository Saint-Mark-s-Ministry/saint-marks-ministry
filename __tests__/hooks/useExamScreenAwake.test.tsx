import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExamScreenAwake } from '@/hooks/useExamScreenAwake'
class ScreenLock extends EventTarget {
  released = false
  type = 'screen' as const
  release = vi.fn(async () => { this.released = true; this.dispatchEvent(new Event('release')) })
}
let hidden = false
let locks: ScreenLock[]
let request: ReturnType<typeof vi.fn>
beforeEach(() => {
  hidden = false; locks = []
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  request = vi.fn(async () => { const lock = new ScreenLock(); locks.push(lock); return lock })
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
})
afterEach(() => { cleanup(); Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined }) })
describe('exam screen awake', () => {
  it('requests only during an exam and releases when the attempt ends', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useExamScreenAwake(enabled), { initialProps: { enabled: false } })
    expect(request).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => expect(result.current).toBe('active'))
    expect(request).toHaveBeenCalledWith('screen')
    rerender({ enabled: false })
    expect(result.current).toBe('idle')
    expect(locks[0].release).toHaveBeenCalledOnce()
  })
  it('reports revocation and reacquires on returning to the visible exam', async () => {
    const { result, unmount } = renderHook(() => useExamScreenAwake(true))
    await waitFor(() => expect(result.current).toBe('active'))
    await act(async () => locks[0].release())
    expect(result.current).toBe('unavailable')
    act(() => { hidden = true; document.dispatchEvent(new Event('visibilitychange')) })
    expect(request).toHaveBeenCalledTimes(1)
    act(() => { hidden = false; document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(result.current).toBe('active'))
    expect(request).toHaveBeenCalledTimes(2)
    unmount()
    expect(locks[1].release).toHaveBeenCalledOnce()
  })
  it('handles unsupported browsers and denied requests without throwing', async () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined })
    const unsupported = renderHook(() => useExamScreenAwake(true))
    expect(unsupported.result.current).toBe('unavailable'); unsupported.unmount()
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    request.mockRejectedValueOnce(new Error('Low battery'))
    const { result } = renderHook(() => useExamScreenAwake(true))
    await waitFor(() => expect(result.current).toBe('unavailable'))
  })
  it('releases a request that resolves after the exam ends', async () => {
    let resolve!: (lock: ScreenLock) => void
    request.mockImplementationOnce(() => new Promise<ScreenLock>(done => { resolve = done }))
    const { unmount } = renderHook(() => useExamScreenAwake(true))
    unmount()
    const lock = new ScreenLock()
    await act(async () => resolve(lock))
    expect(lock.release).toHaveBeenCalledOnce()
  })
})
