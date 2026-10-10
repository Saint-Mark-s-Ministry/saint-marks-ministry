import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomExamAlertSound } from '@/lib/exam-alert-sound'

const sounds = [
  '/sounds/egyptian-english-uh-oh.wav',
  '/sounds/egyptian-english-oh-no.wav',
  '/sounds/egyptian-english-alalalala.wav',
  '/sounds/egyptian-english-come-back.wav',
  '/sounds/egyptian-english-where-going.wav',
  '/sounds/borat-very-nice.wav',
]
afterEach(() => vi.restoreAllMocks())
describe('proctor alert selection', () => {
  it.each(sounds.map((sound, index) => [index, sound] as const))('selects option %s throughout its equal probability interval', (index, expected) => {
    const random = vi.spyOn(Math, 'random')
    for (const sample of [index / 6, (index + 0.5) / 6, (index + 1) / 6 - 0.000001]) {
      random.mockReturnValue(sample)
      expect(randomExamAlertSound()).toBe(expected)
    }
  })
})
