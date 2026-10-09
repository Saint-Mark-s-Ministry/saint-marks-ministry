import { describe, expect, it } from 'vitest'
import { examActivityMessage, latestPauseActivity } from '@/lib/exam-activity-messages'
import type { ExamActivity } from '@/lib/digital-exam-types'
const event = (kind: string): ExamActivity => ({ id: kind, kind, createdAt: '2026-10-09T20:00:00Z', clientAt: null, actorId: 'student' })
describe('proctor activity messaging', () => {
  it('distinguishes focus, visibility, and contact reports without identifying an app', () => {
    expect(examActivityMessage('BLUR').detail).toContain('cannot confirm a text reply')
    expect(examActivityMessage('HIDDEN').detail).toContain('does not identify which occurred')
    expect(examActivityMessage('CONTACT_LOST').detail).toContain('does not establish')
    expect(examActivityMessage('FOCUS').detail).toContain('does not clear')
  })
  it('identifies saved answers and clears without claiming correctness', () => {
    const saved = examActivityMessage('ANSWER_SAVED', { questionNumber: 12, answerChoice: 'C' })
    expect(saved.title).toBe('Question 12: saved C')
    expect(saved.detail).toContain('not a correctness check')
    expect(examActivityMessage('ANSWER_SAVED', { questionNumber: 12, answerChoice: '' }).title).toBe('Question 12: answer cleared')
    expect(examActivityMessage('ANSWER_SAVED', { questionNumber: 51, answerChoice: 'I' }).title).toBe('Answer saved')
  })
  it('keeps focus return and answer saves from replacing the last interruption reason', () => {
    expect(latestPauseActivity([event('HIDDEN'), event('RETURNED'), event('BLUR'), event('FOCUS'), event('ANSWER_SAVED')])?.kind).toBe('BLUR')
    expect(latestPauseActivity([event('STARTED'), event('ANSWER_SAVED')])).toBeUndefined()
  })
})
