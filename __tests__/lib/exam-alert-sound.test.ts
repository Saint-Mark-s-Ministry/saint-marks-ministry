import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomExamAlertSound } from '@/lib/exam-alert-sound'

afterEach(() => vi.restoreAllMocks())
describe('proctor alert selection', () => {
  it.each([
    [0, '/sounds/egyptian-uh-oh.wav'],
    [0.33332, '/sounds/egyptian-uh-oh.wav'],
    [1 / 3, '/sounds/egyptian-oh-no.wav'],
    [0.66665, '/sounds/egyptian-oh-no.wav'],
    [2 / 3, '/sounds/egyptian-alalalala.wav'],
    [0.99999, '/sounds/egyptian-alalalala.wav'],
  ])('uses equal probability intervals for sample %s', (sample, expected) => {
    vi.spyOn(Math, 'random').mockReturnValue(sample)
    expect(randomExamAlertSound()).toBe(expected)
  })
})
