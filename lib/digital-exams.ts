import type { AuthorizationContext } from '@/lib/authorization'
import { RoleTag } from '@prisma/client'

export const ANSWER_CHOICES = 'ABCDEFGH'
export const QUESTION_COUNT = 50
export const STALE_MS = 30_000
export const CLIENT_EVENT_KINDS = ['HIDDEN', 'RETURNED', 'BLUR', 'FOCUS', 'OFFLINE', 'RECONNECTED', 'SITE_NAVIGATION'] as const
export type ClientEventKind = typeof CLIENT_EVENT_KINDS[number]
export class ExamError extends Error {
  constructor(message: string, public readonly status = 400) { super(message) }
}
export function examPermissions(context: AuthorizationContext) {
  const staff = !context.disabled && [RoleTag.SUPER_ADMIN, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.PRIEST].some(tag => context.roleTags.has(tag))
  return { staff, manage: staff && !context.readOnly && (context.roleTags.has(RoleTag.SUPER_ADMIN) || context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT)), student: !context.disabled && !context.readOnly && context.roleTags.has(RoleTag.SERVANTS_PREP_STUDENT) }
}
export function validateConfiguration(counts: unknown, key: unknown): { choiceCounts: number[]; answerKey: string[] } {
  if (!Array.isArray(counts) || counts.length !== QUESTION_COUNT || !counts.every(n => Number.isInteger(n) && n >= 2 && n <= ANSWER_CHOICES.length)) throw new ExamError('Set between two and eight choices for all 50 questions.')
  if (!Array.isArray(key) || key.length !== QUESTION_COUNT || !key.every((a, i) => typeof a === 'string' && /^[A-H]$/.test(a) && a.charCodeAt(0) - 65 < counts[i])) throw new ExamError('Enter a valid answer key for all 50 questions.')
  return { choiceCounts: counts, answerKey: key }
}
export function validAnswer(question: unknown, answer: unknown, counts: number[]): question is number {
  return Number.isInteger(question) && typeof question === 'number' && question >= 0 && question < QUESTION_COUNT && typeof answer === 'string' && (answer === '' || (/^[A-H]$/.test(answer) && answer.charCodeAt(0) - 65 < counts[question]))
}
export function gradeAnswers(answers: string[], key: string[]) {
  return answers.reduce((total, answer, index) => total + (answer !== '' && answer === key[index] ? 1 : 0), 0)
}
export function staleContact(lastSeen: Date | string, now = Date.now()) { return now - new Date(lastSeen).getTime() > STALE_MS }
export function eligibleYear(studentYear: string, examYear: string) { return examYear === 'BOTH' || studentYear === examYear }
export function canAnswer(state: string, examState: string, lastSeen: Date | string, now = Date.now()) { return state === 'ACTIVE' && examState === 'OPEN' && !staleContact(lastSeen, now) }

export function safeExamDestination(path: unknown): string | null {
  if (typeof path !== 'string') return null
  const pathname = path.split(/[?#]/, 1)[0]
  if (pathname.length > 200 || !/^\/(?:dashboard(?:\/[A-Za-z0-9/_-]*)?|settings|privacy|terms|login)$/.test(pathname)) return null
  return pathname
}
