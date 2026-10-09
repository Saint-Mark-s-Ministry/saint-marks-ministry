// @vitest-environment node
// Run only against the isolated branch: DIGITAL_EXAM_INTEGRATION=1 bun test:run <this file>.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { PrismaClient, RoleTag } from '@prisma/client'
const identity = vi.hoisted(() => ({ id: '', tag: 'SERVANTS_PREP_STUDENT', readOnly: false }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: identity.id }) }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: async () => ({ disabled: false, readOnly: identity.readOnly, roleTags: new Set([identity.tag]) }) }))
vi.mock('@/lib/exam-realtime', () => ({ publishExamChange: vi.fn(), examPusher: () => null }))
import { mutateExam } from '@/lib/digital-exam-service'
import { GET } from '@/app/api/digital-exams/[id]/route'
import { GET as listExams } from '@/app/api/digital-exams/route'

const enabled = process.env.DIGITAL_EXAM_INTEGRATION === '1'
const db = new PrismaClient()
const fixture = { studentId: '', otherId: '', examId: '', yearId: '' }
const token = randomUUID()
const staff = { user: { id: 'test-proctor' }, staff: true, manage: true, student: false } as Parameters<typeof mutateExam>[2]
const student = () => ({ user: { id: fixture.studentId }, staff: false, manage: false, student: true }) as Parameters<typeof mutateExam>[2]
const act = (action: string, extra: Record<string, unknown> = {}) => mutateExam(fixture.examId, { action, sessionToken: token, ...extra }, student())
const admin = (action: string, extra: Record<string, unknown> = {}) => mutateExam(fixture.examId, { action, ...extra }, staff)
const get = () => GET(new Request('http://localhost'), { params: Promise.resolve({ id: fixture.examId }) })

describe.skipIf(!enabled)('digital exam database and API integration', () => {
  beforeAll(async () => {
    if (!process.env.DIGITAL_EXAM_TEST_DATABASE_URL || process.env.SP_DATABASE_URL !== process.env.DIGITAL_EXAM_TEST_DATABASE_URL) throw new Error('Set DIGITAL_EXAM_TEST_DATABASE_URL and SP_DATABASE_URL to the same isolated test branch URL.')
    const suffix = randomUUID()
    const year = await db.academicYear.create({ data: { name: `Digital exam test ${suffix}`, startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), isActive: false } })
    fixture.yearId = year.id
    const users = await Promise.all(['student', 'other'].map(name => db.user.create({ data: { email: `digital-${name}-${suffix}@example.invalid`, name: `Digital test ${name}`, role: 'STUDENT', password: 'not-a-valid-hash', enrollments: { create: { academicYearId: year.id, yearLevel: 'YEAR_1' } }, roleAssignments: { create: { tag: RoleTag.SERVANTS_PREP_STUDENT, source: 'SYSTEM' } } } })))
    fixture.studentId = users[0].id; fixture.otherId = users[1].id; staff.user.id = users[1].id
    const section = await db.examSection.findFirstOrThrow()
    const exam = await db.exam.create({ data: { academicYearId: year.id, examSectionId: section.id, examDate: new Date(), yearLevel: 'YEAR_1', totalPoints: 100 } })
    fixture.examId = exam.id
  }, 30000)
  beforeEach(async () => {
    identity.id = fixture.studentId; identity.tag = 'SERVANTS_PREP_STUDENT'; identity.readOnly = false
    await db.digitalExamSheet.deleteMany({ where: { examId: fixture.examId } })
    await db.examScore.deleteMany({ where: { examId: fixture.examId } })
    await db.studentEnrollment.update({ where: { studentId: fixture.studentId }, data: { isActive: true, yearLevel: 'YEAR_1' } })
    const counts = Array(50).fill(4); counts[0] = 5; counts[7] = 8
    const key = Array(50).fill('A'); key[0] = 'E'; key[7] = 'H'
    await admin('configure', { choiceCounts: counts, answerKey: key }); await admin('open')
  }, 30000)
  afterAll(async () => {
    if (fixture.examId) await db.exam.delete({ where: { id: fixture.examId } })
    const ids = [fixture.studentId, fixture.otherId].filter(Boolean)
    if (ids.length) { await db.userRoleAssignment.deleteMany({ where: { userId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }) }
    if (fixture.yearId) await db.academicYear.delete({ where: { id: fixture.yearId } })
    await db.$disconnect()
  }, 30000)
  it('saves mixed choices, hides keys and grades, publishes only on release', async () => {
    const start = await act('start')
    expect('attempt' in start).toBe(true)
    await act('save', { question: 0, answer: 'E', revision: 0 })
    await expect(act('save', { question: 1, answer: 'E', revision: 1 })).rejects.toThrow('valid answer')
    await act('submit', { revision: 1 })
    const response = await get(); const view = await response.json()
    expect(response.status).toBe(200)
    expect(view).not.toHaveProperty('answerKey')
    expect(view.sheet).not.toHaveProperty('answerKey')
    expect(view.attempt).not.toHaveProperty('correctCount')
    expect(await db.examScore.count({ where: { examId: fixture.examId } })).toBe(0)
    await admin('close'); await admin('release')
    const score = await db.examScore.findFirstOrThrow({ where: { examId: fixture.examId } })
    expect(score.percentage).toBe(2); expect(score.originalScore).toBe(2)
    expect((await get()).status).toBe(404)
    await admin('release')
    expect(await db.examScore.count({ where: { examId: fixture.examId } })).toBe(1)
  }, 30000)
  it('saves and grades an eighth choice without exposing the answer key', async () => {
    await act('start')
    await act('save', { question: 7, answer: 'H', revision: 0 })
    await act('submit', { revision: 1 })
    const view = await (await get()).json()
    expect(view.sheet.choiceCounts[7]).toBe(8)
    expect(view).not.toHaveProperty('answerKey')
    expect(view.attempt).not.toHaveProperty('correctCount')
    await admin('close'); await admin('release')
    expect((await db.examScore.findFirstOrThrow({ where: { examId: fixture.examId } })).percentage).toBe(2)
  }, 30000)
  it('shows student answer sheets only during proctoring, including direct links', async () => {
    const listed = async () => (await (await listExams()).json()).exams.some((e: { id: string }) => e.id === fixture.examId)
    expect(await listed()).toBe(true)
    expect((await get()).status).toBe(200)
    await act('start')
    await admin('close')
    expect(await listed()).toBe(false)
    expect((await get()).status).toBe(404)
    await admin('open')
    expect(await listed()).toBe(true)
    const view = await (await get()).json()
    expect(view.attempt.state).toBe('SUBMITTED')
    expect(view).not.toHaveProperty('answerKey')
    await admin('close'); await admin('release')
    expect(await listed()).toBe(false)
    expect((await get()).status).toBe(404)
  }, 30000)
  it('persists tab pause, deduplicates events, and only allows proctor unlock after return', async () => {
    await act('start')
    const event = { id: randomUUID(), kind: 'HIDDEN', at: new Date().toISOString() }
    await act('events', { events: [event], visible: false })
    const attempt = await db.digitalExamAttempt.findFirstOrThrow({ where: { examId: fixture.examId } })
    await expect(admin('unlock', { attemptId: attempt.id })).rejects.toThrow('return and reconnect')
    const blocked = await act('save', { question: 0, answer: 'E', revision: attempt.revision })
    expect(blocked).toHaveProperty('blocked', true)
    await act('events', { events: [{ id: randomUUID(), kind: 'RETURNED' }] })
    await admin('unlock', { attemptId: attempt.id })
    await act('events', { events: [event] })
    const resumed = await db.digitalExamAttempt.findUniqueOrThrow({ where: { id: attempt.id } })
    expect(resumed.state).toBe('ACTIVE')
    expect(await db.digitalExamEvent.count({ where: { attemptId: attempt.id, kind: 'HIDDEN' } })).toBe(1)
    await act('save', { question: 0, answer: 'E', revision: resumed.revision })
  }, 30000)
  it('detects stale contact and persists the pause even when an answer is blocked', async () => {
    await act('start')
    await db.digitalExamAttempt.updateMany({ where: { examId: fixture.examId }, data: { lastSeenAt: new Date(Date.now() - 31000) } })
    expect(await act('save', { question: 0, answer: 'E', revision: 0 })).toHaveProperty('blocked', true)
    const attempt = await db.digitalExamAttempt.findFirstOrThrow({ where: { examId: fixture.examId } })
    expect(attempt.state).toBe('PAUSED'); expect(attempt.answers[0]).toBe('')
    await act('heartbeat')
    await admin('unlock', { attemptId: attempt.id })
  }, 30000)
  it('rejects a competing session, then allows stale recovery only while paused', async () => {
    await act('start')
    const otherToken = randomUUID()
    await expect(act('start', { sessionToken: otherToken })).rejects.toThrow('another answering session')
    await db.digitalExamAttempt.updateMany({ where: { examId: fixture.examId }, data: { lastSeenAt: new Date(Date.now() - 31000) } })
    const recovered = await act('start', { sessionToken: otherToken })
    expect(recovered).toHaveProperty('attempt.state', 'PAUSED')
    await expect(act('heartbeat')).rejects.toThrow('owns this attempt')
  }, 30000)
  it('finalizes saved answers on close and cannot reopen a submitted attempt', async () => {
    await act('start'); await act('save', { question: 0, answer: 'E', revision: 0 })
    await admin('close'); await admin('open')
    expect(await act('start')).toHaveProperty('attempt.state', 'SUBMITTED')
    await expect(act('save', { question: 0, answer: 'A', revision: 2 })).rejects.toThrow('already been submitted')
    expect(await act('submit')).toHaveProperty('attempt.state', 'SUBMITTED')
  }, 30000)
  it('serializes concurrent close and save so no answer changes after finalization', async () => {
    await act('start')
    await Promise.allSettled([act('save', { question: 0, answer: 'E', revision: 0 }), admin('close')])
    const attempt = await db.digitalExamAttempt.findFirstOrThrow({ where: { examId: fixture.examId } })
    expect(attempt.state).toBe('SUBMITTED'); expect(attempt.correctCount).toBe(attempt.answers[0] === 'E' ? 1 : 0)
    await expect(act('save', { question: 0, answer: 'A', revision: attempt.revision })).rejects.toThrow('already been submitted')
  }, 30000)
  it('protects configuration, eligibility, read-only priests, and other attempts', async () => {
    await expect(admin('configure', { choiceCounts: Array(50).fill(4), answerKey: Array(50).fill('A') })).rejects.toThrow('locked after opening')
    await expect(mutateExam(fixture.examId, { action: 'close' }, { ...staff, manage: false })).rejects.toThrow('Forbidden')
    await db.studentEnrollment.update({ where: { studentId: fixture.studentId }, data: { yearLevel: 'YEAR_2' } })
    await expect(act('start')).rejects.toThrow('Forbidden')
    await db.studentEnrollment.update({ where: { studentId: fixture.studentId }, data: { yearLevel: 'YEAR_1', isActive: false } })
    expect((await get()).status).toBe(403)
    await db.studentEnrollment.update({ where: { studentId: fixture.studentId }, data: { isActive: true } })
    await act('start', { studentId: fixture.otherId })
    expect(await db.digitalExamAttempt.count({ where: { examId: fixture.examId, studentId: fixture.otherId } })).toBe(0)
    identity.tag = 'SUNDAY_SCHOOL_SERVANT'; expect((await get()).status).toBe(403)
  }, 30000)
  it('blocks an answer request reporting a hidden tab before saving it', async () => {
    await act('start')
    expect(await act('save', { question: 0, answer: 'E', revision: 0, visible: false })).toHaveProperty('blocked', true)
    const attempt = await db.digitalExamAttempt.findFirstOrThrow({ where: { examId: fixture.examId } })
    expect(attempt.state).toBe('PAUSED'); expect(attempt.answers[0]).toBe('')
  }, 30000)
  it('does not overwrite existing paper grades when releasing results', async () => {
    await act('start'); await act('submit', { revision: 0 }); await admin('close')
    await db.examScore.create({ data: { examId: fixture.examId, studentId: fixture.studentId, score: 90, percentage: 90 } })
    await expect(admin('release')).rejects.toThrow('Existing grades overlap')
    expect((await db.digitalExamSheet.findUniqueOrThrow({ where: { examId: fixture.examId } })).releasedAt).toBeNull()
    expect((await db.examScore.findFirstOrThrow({ where: { examId: fixture.examId } })).percentage).toBe(90)
  }, 30000)
})
