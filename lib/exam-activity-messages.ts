import type { ExamActivity } from '@/lib/digital-exam-types'

export const PAUSE_ALERT_KINDS = new Set(['HIDDEN', 'HIDDEN_RECOVERY', 'BLUR', 'OFFLINE', 'CONTACT_LOST', 'SESSION_RECOVERY', 'RECONNECTED', 'SITE_NAVIGATION'])
const labels: Record<string, string> = {
  RETAKE_APPROVED: 'Retake approved',
  RESULT_RELEASED: 'Result released',
  STARTED: 'Exam started',
  HIDDEN: 'Exam page hidden',
  HIDDEN_RECOVERY: 'Exam page hidden',
  BLUR: 'Exam lost focus',
  RETURNED: 'Returned to exam',
  FOCUS: 'Exam regained focus',
  OFFLINE: 'Connection lost',
  CONTACT_LOST: 'Contact lost for over 30 seconds',
  RECONNECTED: 'Reconnected',
  SESSION_RECOVERY: 'Answering session recovered',
  UNLOCKED: 'Unlocked by proctor',
  SUBMITTED: 'Exam submitted',
  CLOSED_BY_PROCTOR: 'Submitted when exam closed',
}
export function examActivityMessage(kind: string, event?: Pick<ExamActivity, 'questionNumber' | 'answerChoice' | 'destinationPath'>) {
  if (kind === 'SITE_NAVIGATION') return { title: event?.destinationPath ? `Left exam for ${event.destinationPath}` : 'Left exam for another website page' }
  if (kind === 'ANSWER_SAVED') {
    const question = event?.questionNumber
    const choice = event?.answerChoice
    if (typeof question === 'number' && Number.isInteger(question) && question >= 1 && question <= 50 && typeof choice === 'string' && /^(?:[A-H])?$/.test(choice)) {
      return { title: choice ? `Question ${question}: chose ${choice}` : `Question ${question}: answer cleared` }
    }
    return { title: 'Answer saved' }
  }
  return { title: labels[kind] ?? kind }
}
export function latestPauseActivity(events: ExamActivity[]) {
  return [...events].reverse().find(event => PAUSE_ALERT_KINDS.has(event.kind))
}
