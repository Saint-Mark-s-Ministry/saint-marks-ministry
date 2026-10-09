import type { ExamActivity } from '@/lib/digital-exam-types'

export const PAUSE_ALERT_KINDS = new Set(['HIDDEN', 'HIDDEN_RECOVERY', 'BLUR', 'OFFLINE', 'CONTACT_LOST', 'SESSION_RECOVERY', 'RECONNECTED', 'SITE_NAVIGATION'])
const messages: Record<string, { title: string; detail: string; nextStep: string }> = {
  RETAKE_APPROVED: { title: 'Individual retake approved', detail: 'A leader approved a new blank attempt for this student. Earlier answers, activity and grades are preserved.', nextStep: 'Open the exam for proctoring. The higher score is published only when a leader releases results.' },
  RESULT_RELEASED: { title: 'Result released by leader', detail: 'The leader released this result. An existing higher grade is retained.', nextStep: 'The published grade is available in My Progress.' },
  STARTED: { title: 'Exam started', detail: 'The student opened an answering session.', nextStep: 'Monitor progress and contact status.' },
  HIDDEN: { title: 'Exam page hidden', detail: 'The browser reported that the exam page was no longer visible. Switching apps or tabs, or locking the phone, can cause this. The browser does not identify which occurred.', nextStep: 'Have the student return to the exam and explain the interruption before unlocking.' },
  HIDDEN_RECOVERY: { title: 'Hidden page detected during a request', detail: 'An exam request reported that the page was hidden, even though a separate departure report had not yet been saved.', nextStep: 'Have the student return to the exam and review the activity before unlocking.' },
  BLUR: { title: 'Exam lost focus', detail: 'The browser reported that focus moved away from the exam window while the page may still have been visible. A notification interaction or address-bar action can cause this; the report cannot confirm a text reply or identify another app.', nextStep: 'Ask the student to return focus to the exam, explain the interruption, and enable Do Not Disturb before you unlock.' },
  RETURNED: { title: 'Exam page visible again', detail: 'The browser reported that the student returned to the visible exam page. Returning does not clear a paused attempt.', nextStep: 'Check the current status. Review the interruption before unlocking if it is still paused.' },
  FOCUS: { title: 'Exam regained focus', detail: 'The browser reported that focus returned to the exam window. Regaining focus does not clear a paused attempt.', nextStep: 'Check the current status. A paused attempt still needs explicit proctor clearance.' },
  OFFLINE: { title: 'Connection loss reported', detail: 'The student device reported a lost connection or a failed network request. This is different from a reported tab departure. Pending answers may still be waiting on the device.', nextStep: 'Have the student stay on the exam page and reconnect. Review their status before unlocking.' },
  CONTACT_LOST: { title: 'Contact stale on reconnect', detail: 'The server detected more than 30 seconds without contact when the student next made a request. This does not establish that the student left the tab.', nextStep: 'Confirm the student is connected and back on the exam page, then review the gap before unlocking.' },
  RECONNECTED: { title: 'Device reconnected', detail: 'The device reported a restored connection. Reconnecting does not clear the pause; pending answers may still be waiting to save.', nextStep: 'Confirm the student has returned and review the interruption before unlocking.' },
  SESSION_RECOVERY: { title: 'Answering session recovered', detail: 'A different answering session took over after the previous session stopped contacting the server for more than 30 seconds. This can follow a refresh, browser restart, or another device signing in; the report does not identify the cause.', nextStep: 'Confirm that the student is using the intended session and review the gap before unlocking.' },
  UNLOCKED: { title: 'Proctor unlocked the attempt', detail: 'A proctor explicitly cleared the pause. This action was recorded in the activity history.', nextStep: 'The student can resume if the exam is still open and their connection is current.' },
  SUBMITTED: { title: 'Student submitted final answers', detail: 'The student finalized the saved answers. This attempt cannot be reopened.', nextStep: 'No unlock is needed. Grades remain private until results are released.' },
  CLOSED_BY_PROCTOR: { title: 'Finalized when the exam closed', detail: 'The proctor closed the exam and the server finalized this attempt using saved answers. Unanswered questions count as incorrect; unsaved device changes cannot be included.', nextStep: 'This attempt cannot be reopened. Review results before releasing grades.' },
}
export function examActivityMessage(kind: string, event?: Pick<ExamActivity, 'questionNumber' | 'answerChoice' | 'destinationPath'>) {
  if (kind === 'SITE_NAVIGATION') return { title: 'Navigated away within this website', detail: `The student device reported navigating from the exam to another page on this website${event?.destinationPath ? `: ${event.destinationPath}` : '.'} Query parameters and page contents are not recorded.`, nextStep: 'Have the student return to the exam and explain the navigation before unlocking.' }
  if (kind === 'ANSWER_SAVED') {
    const question = event?.questionNumber
    const choice = event?.answerChoice
    if (typeof question === 'number' && Number.isInteger(question) && question >= 1 && question <= 50 && typeof choice === 'string' && /^(?:[A-H])?$/.test(choice)) {
      return { title: choice ? `Question ${question}: saved ${choice}` : `Question ${question}: answer cleared`, detail: choice ? `The server saved answer ${choice} for question ${question}. This is a saved selection, not a correctness check.` : `The server saved a blank answer for question ${question}. If it remains blank at final submission, it counts as incorrect.`, nextStep: 'No proctor action is needed. Monitor progress; the student can change this answer until submission.' }
    }
    return { title: 'Answer saved', detail: 'An answer change was saved on the server.', nextStep: 'Review the saved progress and activity history.' }
  }
  return messages[kind] ?? { title: kind, detail: 'An additional activity event was recorded.', nextStep: 'Review the activity history and current attempt status.' }
}
export function latestPauseActivity(events: ExamActivity[]) {
  return [...events].reverse().find(event => PAUSE_ALERT_KINDS.has(event.kind))
}
