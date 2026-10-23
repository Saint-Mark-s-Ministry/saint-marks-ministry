import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useModalExit } from '@/hooks/use-modal-exit'

describe('shared modal exit lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.style.setProperty('--modal-motion-duration', '200ms')
  })
  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.style.removeProperty('--modal-motion-duration')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('closes the surface before releasing its owner and contents', () => {
    const release = vi.fn()
    const { result } = renderHook(() => useModalExit(release))
    act(() => result.current.close())
    expect(result.current.closing).toBe(true)
    expect(release).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(200))
    expect(release).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(50))
    expect(release).toHaveBeenCalledOnce()
  })

  it('cancels an interrupted close and ignores repeat dismissal', () => {
    const release = vi.fn()
    const { result } = renderHook(() => useModalExit(release))
    act(() => { result.current.close(); result.current.close() })
    act(() => result.current.cancel())
    act(() => vi.runAllTimers())
    expect(release).not.toHaveBeenCalled()
    expect(result.current.closing).toBe(false)
    act(() => result.current.close())
    act(() => vi.runAllTimers())
    expect(release).toHaveBeenCalledOnce()
  })

  it('cancels pending callbacks when a modal owner unmounts', () => {
    const release = vi.fn()
    const { result, unmount } = renderHook(() => useModalExit(release))
    act(() => result.current.close())
    unmount()
    act(() => vi.runAllTimers())
    expect(release).not.toHaveBeenCalled()
  })

  it('respects reduced motion without delaying focus restoration', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    const release = vi.fn()
    const { result } = renderHook(() => useModalExit(release))
    act(() => result.current.close())
    expect(release).toHaveBeenCalledOnce()
    expect(result.current.closing).toBe(false)
  })
})
