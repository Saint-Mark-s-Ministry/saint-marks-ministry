import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { observeAnimatedSize } from '@/lib/animate-element-size'

let resized: () => void
let mutated: () => void
let motionChanged: () => void
let natural: { width: number; height: number }
let frame: { width: number; height: number } | null
let reduced: boolean
let element: HTMLDivElement
let cleanup: () => void
const disconnectResize = vi.fn()
const disconnectMutation = vi.fn()
const animations: Array<{ cancel: ReturnType<typeof vi.fn>; finish: () => void; currentTime: number }> = []
const animate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  animations.length = 0
  natural = { width: 512, height: 320 }
  frame = null
  reduced = false
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resized = callback }
    observe() {}
    disconnect = disconnectResize
  })
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { mutated = callback }
    observe() {}
    disconnect = disconnectMutation
  })
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced },
    addEventListener: (_event: string, callback: () => void) => { motionChanged = callback },
    removeEventListener: vi.fn(),
  }))
  element = document.createElement('div')
  element.dataset.state = 'open'
  element.style.maxHeight = '90dvh'
  element.style.overflowY = 'auto'
  Object.defineProperties(element, {
    offsetWidth: { get: () => (frame ?? natural).width },
    offsetHeight: { get: () => (frame ?? natural).height },
  })
  animate.mockImplementation((keyframes: Array<{ width: string; height: string }>) => {
    let finish!: () => void
    let reject!: () => void
    const finished = new Promise<void>((resolve, fail) => { finish = resolve; reject = () => fail(new Error('cancelled')) })
    frame = { width: parseFloat(keyframes[0].width), height: parseFloat(keyframes[0].height) }
    const animation = {
      currentTime: 0, finished,
      finish: () => { frame = null; finish() },
      cancel: vi.fn(() => { frame = null; reject() }),
    }
    animations.push(animation)
    return animation
  })
  element.animate = animate
  cleanup = observeAnimatedSize(element)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('shared modal resize animation', () => {
  it('does not animate initial layout, and animates expansion and collapse with natural sizing restored', async () => {
    resized()
    expect(animate).not.toHaveBeenCalled()
    natural.height = 640
    resized()
    expect(animate.mock.calls[0][0]).toEqual([
      { width: '512px', height: '320px', overflow: 'clip' },
      { width: '512px', height: '640px', overflow: 'clip' },
    ])
    animations[0].finish()
    await Promise.resolve()
    resized()
    expect(animate).toHaveBeenCalledOnce()
    natural.height = 280
    resized()
    expect(animate.mock.calls[1][0][0].height).toBe('640px')
    expect(animate.mock.calls[1][0][1].height).toBe('280px')
    expect(element.style.height).toBe('')
    expect(element.style.width).toBe('')
    expect(element.style.maxHeight).toBe('90dvh')
    expect(element.style.overflowY).toBe('auto')
  })

  it('ignores its own resize frames rather than creating an observer loop', () => {
    natural.height = 640
    resized()
    frame = { width: 512, height: 450 }
    resized()
    resized()
    expect(animate).toHaveBeenCalledOnce()
  })

  it('retargets rapid content changes from the current visible size', () => {
    natural.height = 640
    resized()
    frame = { width: 512, height: 450 }
    natural.height = 380
    mutated()
    expect(animations[0].cancel).toHaveBeenCalledOnce()
    expect(animate.mock.calls[1][0][0].height).toBe('450px')
    expect(animate.mock.calls[1][0][1].height).toBe('380px')
  })

  it('does not prolong the animation for unrelated DOM changes', () => {
    natural.height = 640
    resized()
    animations[0].currentTime = 100
    frame = { width: 512, height: 580 }
    mutated()
    expect(animate.mock.calls[1][1].duration).toBe(120)
    animations[1].currentTime = 30
    frame = { width: 512, height: 610 }
    mutated()
    expect(animate.mock.calls[2][1].duration).toBe(90)
  })

  it('handles responsive width changes as well as height changes', () => {
    natural = { width: 360, height: 500 }
    window.dispatchEvent(new Event('resize'))
    expect(animate.mock.calls[0][0][1]).toMatchObject({ width: '360px', height: '500px' })
  })

  it('respects reduced motion and cancels an in-progress animation when it is enabled', () => {
    reduced = true
    natural.height = 500
    resized()
    expect(animate).not.toHaveBeenCalled()
    reduced = false
    natural.height = 640
    resized()
    expect(animate).toHaveBeenCalledOnce()
    reduced = true
    motionChanged()
    expect(animations[0].cancel).toHaveBeenCalledOnce()
    natural.height = 280
    resized()
    expect(animate).toHaveBeenCalledOnce()
  })

  it('stops on close or unmount without interfering with the closing animation', () => {
    natural.height = 640
    resized()
    element.dataset.state = 'closed'
    mutated()
    expect(animations[0].cancel).toHaveBeenCalledOnce()
    natural.height = 280
    resized()
    expect(animate).toHaveBeenCalledOnce()
    cleanup()
    expect(disconnectResize).toHaveBeenCalledOnce()
    expect(disconnectMutation).toHaveBeenCalledOnce()
    resized()
    expect(animate).toHaveBeenCalledOnce()
  })
})
