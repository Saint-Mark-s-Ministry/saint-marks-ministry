import { createHash } from 'node:crypto'
import { Prisma, type DigitalExamAttempt, type DigitalExamSheet, type Exam } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext } from '@/lib/authorization'
import { CLIENT_EVENT_KINDS, ExamError, QUESTION_COUNT, eligibleYear, examPermissions, gradeAnswers, staleContact, validAnswer, validateConfiguration } from '@/lib/digital-exams'
import { publishExamChange } from '@/lib/exam-realtime'
import { handleApiError } from '@/lib/api-utils'
import { NextResponse } from 'next/server'

type Tx = Prisma.TransactionClient
export async function examAccess() {
  const user = await requireAuth()
  const permissions = examPermissions(await getAuthorizationContext(user.id))
  if (!permissions.staff && !permissions.student) throw new Error('Forbidden')
  return { user, ...permissions }
}
export function examApiError(error: unknown) {
  if (error instanceof ExamError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return NextResponse.json({ error: 'The exam changed. Refresh and try again.' }, { status: 409 })
  return handleApiError(error)
}
export function publicAttempt(attempt: DigitalExamAttempt | null, released = false) {
  if (!attempt) return null
  return { id: attempt.id, state: attempt.state, answers: attempt.answers, revision: attempt.revision, startedAt: attempt.startedAt, lastSeenAt: attempt.lastSeenAt, pausedAt: attempt.pausedAt, submittedAt: attempt.submittedAt, ...(released ? { correctCount: attempt.correctCount, percentage: (attempt.correctCount ?? 0) * 2 } : {}) }
}
export const examSummarySelect = { id: true, examDate: true, yearLevel: true, totalPoints: true, academicYear: { select: { name: true } }, examSection: { select: { displayName: true } } } as const
export async function eligibleForExam(db: Tx | typeof prisma, studentId: string, exam: Pick<Exam, 'academicYearId' | 'yearLevel'>) {
  const enrollment = await db.studentEnrollment.findUnique({ where: { studentId }, select: { isActive: true, status: true, yearLevel: true, academicYear: { select: { startDate: true } } } })
  if (!enrollment?.isActive || enrollment.status !== 'ACTIVE' || !eligibleYear(enrollment.yearLevel, exam.yearLevel)) return false
  const year = await db.academicYear.findUnique({ where: { id: exam.academicYearId }, select: { startDate: true, isActive: true } })
  return !!year && (enrollment.academicYear ? year.startDate >= enrollment.academicYear.startDate : year.isActive)
}
// Every writer locks the same existing parent row, including sheet creation.
// This serializes save/submit/close/unlock and prevents TOCTOU authorization of states.
export async function lockedExam<T>(examId: string, work: (tx: Tx, exam: Exam, sheet: DigitalExamSheet | null) => Promise<T>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Exam" WHERE id = ${examId} FOR UPDATE`
    const exam = await tx.exam.findUnique({ where: { id: examId } })
    if (!exam) throw new Error('Not found')
    const sheet = await tx.digitalExamSheet.findUnique({ where: { examId } })
    return work(tx, exam, sheet)
  }, { maxWait: 10_000, timeout: 20_000 })
}
async function record(tx: Tx, attemptId: string, kind: string, actorId: string) {
  await tx.digitalExamEvent.create({ data: { attemptId, kind, actorId } })
}
async function finalize(tx: Tx, attempt: DigitalExamAttempt, sheet: DigitalExamSheet, actorId: string, kind = 'SUBMITTED') {
  const updated = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { state: 'SUBMITTED', submittedAt: new Date(), correctCount: gradeAnswers(attempt.answers, sheet.answerKey), revision: { increment: 1 } } })
  await record(tx, attempt.id, kind, actorId)
  return updated
}
export function sessionHash(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9-]{36,80}$/i.test(token)) throw new ExamError('A valid answering session is required.')
  return createHash('sha256').update(token).digest('hex')
}
export async function mutateExam(examId: string, input: Record<string, unknown>, access: Awaited<ReturnType<typeof examAccess>>) {
  const { user, manage, student } = access
  const action = input.action
  const staffAction = ['configure', 'open', 'close', 'unlock', 'release'].includes(String(action))
  if (staffAction ? !manage : !student) throw new Error('Forbidden')
  const result = await lockedExam(examId, async (tx, exam, sheet) => {
    if (action === 'configure') {
      if (sheet?.openedAt) throw new ExamError('The answer key and choices are locked after opening.', 409)
      const config = validateConfiguration(input.choiceCounts, input.answerKey)
      await tx.digitalExamSheet.upsert({ where: { examId }, create: { examId, ...config }, update: config })
      return { success: true }
    }
    if (!sheet) throw new ExamError('Set up the answer sheet first.', 409)
    if (action === 'open') {
      if (sheet.releasedAt) throw new ExamError('Released exams cannot reopen.', 409)
      validateConfiguration(sheet.choiceCounts, sheet.answerKey)
      await tx.digitalExamSheet.update({ where: { examId }, data: { state: 'OPEN', openedAt: sheet.openedAt ?? new Date(), closedAt: null } })
      return { success: true }
    }
    if (action === 'close') {
      if (sheet.state !== 'OPEN') throw new ExamError('The exam is not open.', 409)
      const attempts = await tx.digitalExamAttempt.findMany({ where: { examId, state: { not: 'SUBMITTED' } } })
      for (const attempt of attempts) await finalize(tx, attempt, sheet, user.id, 'CLOSED_BY_PROCTOR')
      await tx.digitalExamSheet.update({ where: { examId }, data: { state: 'CLOSED', closedAt: new Date() } })
      return { success: true }
    }
    if (action === 'release') {
      if (sheet.state !== 'CLOSED') throw new ExamError('Close the exam before releasing results.', 409)
      if (sheet.releasedAt) return { success: true }
      const attempts = await tx.digitalExamAttempt.findMany({ where: { examId, state: 'SUBMITTED' } })
      const existing = await tx.examScore.count({ where: { examId, studentId: { in: attempts.map(a => a.studentId) } } })
      if (existing) throw new ExamError('Existing grades overlap these submissions. Resolve them before releasing; no grades were overwritten.', 409)
      await tx.examScore.createMany({ data: attempts.map(a => ({ examId, studentId: a.studentId, score: (a.correctCount ?? 0) / QUESTION_COUNT * exam.totalPoints, percentage: (a.correctCount ?? 0) * 2, originalScore: (a.correctCount ?? 0) / QUESTION_COUNT * exam.totalPoints, originalPercentage: (a.correctCount ?? 0) * 2, gradedBy: user.id, notes: 'Digital answer sheet' })) })
      await tx.digitalExamSheet.update({ where: { examId }, data: { releasedAt: new Date() } })
      return { success: true }
    }
    if (action === 'unlock') {
      if (sheet.state !== 'OPEN') throw new ExamError('The exam must be open to unlock an attempt.', 409)
      if (typeof input.attemptId !== 'string') throw new ExamError('Select a student to unlock.')
      const attempt = await tx.digitalExamAttempt.findFirst({ where: { id: input.attemptId, examId } })
      if (!attempt) throw new Error('Not found')
      if (attempt.state !== 'PAUSED' || !attempt.pageVisible || staleContact(attempt.lastSeenAt)) throw new ExamError('The student must return and reconnect before unlocking.', 409)
      await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { state: 'ACTIVE', pausedAt: null, revision: { increment: 1 } } })
      await record(tx, attempt.id, 'UNLOCKED', user.id)
      return { success: true }
    }
    if (!await eligibleForExam(tx, user.id, exam)) throw new Error('Forbidden')
    const hash = sessionHash(input.sessionToken)
    let attempt = await tx.digitalExamAttempt.findUnique({ where: { examId_studentId: { examId, studentId: user.id } } })
    if (attempt?.state === 'SUBMITTED') {
      if (action === 'submit' || action === 'start' || action === 'heartbeat') return { attempt: publicAttempt(attempt, !!sheet.releasedAt), examState: sheet.state }
      throw new ExamError('Your exam has already been submitted.', 409)
    }
    if (sheet.state !== 'OPEN') throw new ExamError('The exam is not open.', 409)
    if (action === 'start') {
      if (!attempt) {
        attempt = await tx.digitalExamAttempt.create({ data: { examId, studentId: user.id, sessionHash: hash, answers: Array(QUESTION_COUNT).fill('') } })
        await record(tx, attempt.id, 'STARTED', user.id)
      } else if (attempt.sessionHash !== hash) {
        if (!staleContact(attempt.lastSeenAt)) throw new ExamError('This exam is already open in another answering session. Return to that session, or wait 30 seconds after closing it.', 409)
        attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { sessionHash: hash, state: 'PAUSED', pausedAt: new Date(), lastSeenAt: new Date(), revision: { increment: 1 } } })
        await record(tx, attempt.id, 'SESSION_RECOVERY', user.id)
      }
    }
    if (!attempt) throw new ExamError('Start the exam first.', 409)
    if (attempt.sessionHash !== hash) throw new ExamError('Another answering session owns this attempt.', 409)
    const wasStale = staleContact(attempt.lastSeenAt)
    if (wasStale && attempt.state === 'ACTIVE') {
      attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { state: 'PAUSED', pausedAt: new Date(), revision: { increment: 1 } } })
      await record(tx, attempt.id, 'CONTACT_LOST', user.id)
    }
    if (action === 'events') {
      if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 100) throw new ExamError('Send between one and 100 activity events.')
      for (const item of input.events) {
        if (!item || typeof item !== 'object') throw new ExamError('Invalid activity event.')
        const e = item as Record<string, unknown>
        if (typeof e.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(e.id) || !CLIENT_EVENT_KINDS.includes(e.kind as typeof CLIENT_EVENT_KINDS[number])) throw new ExamError('Invalid activity event.')
        const duplicate = await tx.digitalExamEvent.findUnique({ where: { attemptId_clientEventId: { attemptId: attempt.id, clientEventId: e.id } } })
        if (duplicate) continue
        const date = typeof e.at === 'string' ? new Date(e.at) : null
        await tx.digitalExamEvent.create({ data: { attemptId: attempt.id, actorId: user.id, kind: String(e.kind), clientEventId: e.id, clientAt: date && !Number.isNaN(date.getTime()) ? date : null } })
        if (e.kind === 'HIDDEN' || e.kind === 'RETURNED') attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { pageVisible: e.kind === 'RETURNED' } })
        if (['HIDDEN', 'OFFLINE', 'RECONNECTED'].includes(String(e.kind))) {
          attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { state: 'PAUSED', pausedAt: new Date(), revision: { increment: 1 } } })
        }
      }
    } else if (action === 'save' || action === 'submit') {
      // Return the committed stale-contact pause instead of throwing and rolling it back.
      if (attempt.state !== 'ACTIVE') return { attempt: publicAttempt(attempt), examState: sheet.state, blocked: true }
      if (input.revision !== attempt.revision) throw new ExamError('Your answers changed. Refresh the saved answers and try again.', 409)
      if (action === 'save') {
        if (!validAnswer(input.question, input.answer, sheet.choiceCounts)) throw new ExamError('Choose a valid answer.')
        const answers = [...attempt.answers]; answers[input.question] = input.answer as string
        attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { answers, revision: { increment: 1 } } })
      } else attempt = await finalize(tx, attempt, sheet, user.id)
    } else if (action !== 'start' && action !== 'heartbeat') throw new ExamError('Unknown exam action.')
    if (input.visible === false && attempt.state !== 'SUBMITTED') {
      if (attempt.state === 'ACTIVE') {
        await record(tx, attempt.id, 'HIDDEN_RECOVERY', user.id)
        attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { state: 'PAUSED', pausedAt: new Date(), revision: { increment: 1 } } })
      }
      attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { pageVisible: false } })
    }
    attempt = await tx.digitalExamAttempt.update({ where: { id: attempt.id }, data: { lastSeenAt: new Date() } })
    return { attempt: publicAttempt(attempt, !!sheet.releasedAt), examState: sheet.state }
  })
  // Heartbeats have no live event; the dashboard reads last-contact timestamps.
  if (action !== 'heartbeat') await publishExamChange(examId)
  return result
}
