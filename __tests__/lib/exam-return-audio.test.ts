import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createExamReturnAudio } from '@/lib/exam-return-audio'
const source = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null }
const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }
const context = { state: 'running', destination: {}, resume: vi.fn(), close: vi.fn(), decodeAudioData: vi.fn(), createBufferSource: vi.fn(), createGain: vi.fn() }
beforeEach(() => {
  vi.clearAllMocks(); source.onended = null; context.state = 'running'
  context.resume.mockResolvedValue(undefined); context.close.mockResolvedValue(undefined)
  context.decodeAudioData.mockResolvedValue({ duration: 6 })
  context.createBufferSource.mockReturnValue(source); context.createGain.mockReturnValue(gain)
  vi.stubGlobal('AudioContext', vi.fn(function () { return context }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('student return sound', () => {
  it('arms audio within the start gesture without playing, and deduplicates paired return reports', async () => {
    const audio = createExamReturnAudio()
    audio.arm()
    expect(context.resume).toHaveBeenCalledTimes(1)
    expect(source.start).not.toHaveBeenCalled()
    await Promise.all([audio.play(), audio.play()])
    expect(source.start).toHaveBeenCalledTimes(1)
    expect(gain.gain.value).toBe(1)
    audio.stop()
    expect(source.stop).toHaveBeenCalled()
    audio.dispose()
  })
  it('does not play while hidden, and handles unavailable playback without throwing', async () => {
    const audio = createExamReturnAudio()
    audio.arm()
    expect(await audio.play(() => false)).toBe(false)
    expect(source.start).not.toHaveBeenCalled()
    context.createBufferSource.mockImplementationOnce(() => { throw new Error('Blocked playback') })
    expect(await audio.play()).toBe(false)
    audio.dispose()
    expect(context.close).toHaveBeenCalledTimes(1)
    expect(await audio.play()).toBe(false)
  })
  it('closes resources after a playing alert ends or the cleanup timeout expires', async () => {
    vi.useFakeTimers()
    const audio = createExamReturnAudio()
    audio.arm(); await audio.play(); audio.dispose()
    expect(context.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(7000)
    expect(source.stop).toHaveBeenCalled()
    expect(context.close).toHaveBeenCalledTimes(1)
  })
})
