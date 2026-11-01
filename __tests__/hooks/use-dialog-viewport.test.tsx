import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDialogViewport } from '@/hooks/use-dialog-viewport'
let viewport: EventTarget & { height: number; width: number; offsetTop: number; offsetLeft: number }
let frames: Map<number, FrameRequestCallback>
beforeEach(() => {
  viewport = Object.assign(new EventTarget(), { height: 700, width: 390, offsetTop: 0, offsetLeft: 0 })
  frames = new Map()
  let nextId = 0
  vi.stubGlobal('visualViewport', viewport)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { frames.delete(id) }))
})
afterEach(() => vi.unstubAllGlobals())
function flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(0)) }
describe('dialog visible viewport', () => {
  it('uses the visual viewport rather than the layout viewport', () => {
    const { result } = renderHook(() => useDialogViewport(true))
    expect(result.current).toEqual({ '--dialog-viewport-top': '0px', '--dialog-viewport-left': '0px', '--dialog-viewport-height': '700px', '--dialog-viewport-width': '390px' })
  })
  it('tracks keyboard resize and Safari panning in one animation frame', () => {
    const { result } = renderHook(() => useDialogViewport(true))
    act(() => {
      viewport.height = 310; viewport.offsetTop = 150; viewport.offsetLeft = 12; viewport.width = 370
      viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll'))
    })
    expect(frames.size).toBe(1)
    act(flush)
    expect(result.current).toMatchObject({ '--dialog-viewport-height': '310px', '--dialog-viewport-top': '150px', '--dialog-viewport-width': '370px', '--dialog-viewport-left': '12px' })
  })
  it('updates for rotation and cancels pending work on unmount', () => {
    const { result, unmount } = renderHook(() => useDialogViewport(true))
    act(() => { viewport.height = 320; viewport.width = 750; window.dispatchEvent(new Event('orientationchange')) })
    act(flush)
    expect(result.current?.['--dialog-viewport-width']).toBe('750px')
    act(() => viewport.dispatchEvent(new Event('scroll')))
    expect(frames.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
    viewport.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(0)
  })
  it('falls back to window measurements when VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined)
    vi.stubGlobal('innerHeight', 500); vi.stubGlobal('innerWidth', 375)
    const { result } = renderHook(() => useDialogViewport(true))
    expect(result.current?.['--dialog-viewport-height']).toBe('500px')
    act(() => { vi.stubGlobal('innerHeight', 280); window.dispatchEvent(new Event('resize')) })
    act(flush)
    expect(result.current?.['--dialog-viewport-height']).toBe('280px')
  })
  it('leaves ordinary dialogs alone when disabled', () => {
    const { result } = renderHook(() => useDialogViewport(false))
    expect(result.current).toBeUndefined()
    viewport.dispatchEvent(new Event('resize'))
    expect(frames.size).toBe(0)
  })
})
