import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, RoleTag } from '@prisma/client'
import { makeupToday } from '@/lib/makeup-exams'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), exam: vi.fn(), record: vi.fn(), createRecord: vi.fn(), updateRecord: vi.fn(), enrollment: vi.fn(), attempts: vi.fn(), createAttempt: vi.fn(), updateAttempt: vi.fn(), transaction: vi.fn(), records: vi.fn(), enrollments: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/authorization')>(), getAuthorizationContext: mocks.context }))
vi.mock('@/lib/prisma', () => ({ prisma: { exam: { findUnique: mocks.exam }, examScore: { findMany: mocks.records }, studentEnrollment: { findMany: mocks.enrollments }, $transaction: mocks.transaction } }))
import { GET, POST, PATCH } from '@/app/api/exams/[id]/makeup-scores/route'
import { PATCH as patchOriginal } from '@/app/api/exam-scores/[id]/route'
const tx = { exam: { findUnique: mocks.exam }, examScore: { findUnique: mocks.record, create: mocks.createRecord, update: mocks.updateRecord }, studentEnrollment: { findUnique: mocks.enrollment }, makeupExamScore: { findMany: mocks.attempts, create: mocks.createAttempt, update: mocks.updateAttempt } }
const params = { params: Promise.resolve({ id: 'exam' }) }
const input = { studentId: 'student', version: 1, score: 80, totalPoints: 100, takenDate: makeupToday() }
const request = (body: object) => new Request('http://localhost/api/exams/exam/makeup-scores', { method: 'POST', body: JSON.stringify(body) })
const exam = { id: 'exam', yearLevel: 'YEAR_1', totalPoints: 100, examDate: new Date('2020-01-01'), examSection: { passingScore: 60 } }
const record = { id: 'result', examId: 'exam', studentId: 'student', originalScore: 50, originalPercentage: 50, score: 50, percentage: 50, makeupScores: [], exam }

describe('makeup score API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'staff', role: 'SUPER_ADMIN' })
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]), disabled: false, readOnly: false })
    mocks.exam.mockResolvedValue(exam)
    mocks.record.mockResolvedValue(record)
    mocks.createRecord.mockResolvedValue({ ...record, originalScore: null, originalPercentage: null })
    mocks.updateRecord.mockResolvedValue(record)
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', yearLevel: 'YEAR_1' })
    mocks.attempts.mockResolvedValue([{ percentage: 80 }])
    mocks.createAttempt.mockResolvedValue({ id: 'attempt' })
    mocks.updateAttempt.mockResolvedValue({ id: 'attempt' })
    mocks.records.mockResolvedValue([])
    mocks.enrollments.mockResolvedValue([])
    mocks.transaction.mockImplementation(work => work(tx))
  })
  it('records the version separately and updates only the effective result', async () => {
    expect((await POST(request(input), params)).status).toBe(201)
    expect(mocks.createAttempt.mock.calls[0][0].data).toMatchObject({ examScoreId: 'result', version: 1, score: 80, totalPoints: 100, percentage: 80, gradedBy: 'staff' })
    expect(mocks.updateRecord.mock.calls[0][0].data).toEqual({ score: 80, percentage: 80 })
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  })
  it('keeps the higher original result after a lower retake', async () => {
    mocks.attempts.mockResolvedValue([{ percentage: 40 }])
    expect((await POST(request({ ...input, score: 40 }), params)).status).toBe(201)
    expect(mocks.updateRecord.mock.calls[0][0].data).toEqual({ score: 50, percentage: 50 })
  })
  it('accepts version 2 with a different total and compares percentages', async () => {
    expect((await POST(request({ ...input, version: 2, score: 40, totalPoints: 50 }), params)).status).toBe(201)
    expect(mocks.createAttempt.mock.calls[0][0].data).toMatchObject({ version: 2, percentage: 80 })
  })
  it('records a missed exam without inventing an original grade', async () => {
    mocks.record.mockResolvedValue(null)
    expect((await POST(request(input), params)).status).toBe(201)
    expect(mocks.createRecord.mock.calls[0][0].data).not.toHaveProperty('originalScore')
    expect(mocks.createRecord.mock.calls[0][0].data).not.toHaveProperty('originalPercentage')
  })
  it('rejects another attempt after a student has passed', async () => {
    mocks.record.mockResolvedValue({ ...record, percentage: 80 })
    expect((await POST(request(input), params)).status).toBe(400)
    expect(mocks.createAttempt).not.toHaveBeenCalled()
  })
  it('rejects inactive students and wrong year levels', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: false, status: 'ACTIVE' })
    expect((await POST(request(input), params)).status).toBe(400)
    mocks.exam.mockResolvedValue({ ...exam, yearLevel: 'YEAR_2' })
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', yearLevel: 'YEAR_1' })
    expect((await POST(request(input), params)).status).toBe(400)
  })
  it('rejects an attempt ID from another student or exam', async () => {
    expect((await PATCH(request({ ...input, attemptId: 'unrelated' }), params)).status).toBe(404)
    expect(mocks.updateAttempt).not.toHaveBeenCalled()
  })
  it('allows corrections to a prior passing retake and recalculates the best grade', async () => {
    mocks.record.mockResolvedValue({ ...record, percentage: 80, makeupScores: [{ id: 'attempt', percentage: 80 }] })
    mocks.attempts.mockResolvedValue([{ percentage: 40 }])
    expect((await PATCH(request({ ...input, score: 40, attemptId: 'attempt' }), params)).status).toBe(200)
    expect(mocks.updateRecord.mock.calls[0][0].data).toEqual({ score: 50, percentage: 50 })
  })
  it('rejects an invalid version before any database write', async () => {
    expect((await POST(request({ ...input, version: 3 }), params)).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('allows priests to read but not write', async () => {
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.PRIEST]), disabled: false, readOnly: true })
    expect((await GET(request({}), params)).status).toBe(200)
    expect((await POST(request(input), params)).status).toBe(403)
    expect((await PATCH(request({ ...input, attemptId: 'attempt' }), params)).status).toBe(403)
    expect((await patchOriginal(request({ score: 50 }), params)).status).toBe(403)
  })
  it.each([RoleTag.SERVANTS_PREP_STUDENT, RoleTag.SUNDAY_SCHOOL_SERVANT, RoleTag.PARENT])('denies non-staff role %s even if the JWT says admin', async tag => {
    mocks.context.mockResolvedValue({ roleTags: new Set([tag]), disabled: false, readOnly: false })
    expect((await GET(request({}), params)).status).toBe(403)
    expect((await POST(request(input), params)).status).toBe(403)
  })
  it('denies disabled prep servants', async () => {
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]), disabled: true, readOnly: false })
    expect((await POST(request(input), params)).status).toBe(403)
  })
  it('corrects the original grade without losing a better makeup result', async () => {
    mocks.record.mockResolvedValue({ ...record, makeupScores: [{ percentage: 80 }] })
    expect((await patchOriginal(request({ score: 45 }), params)).status).toBe(200)
    expect(mocks.updateRecord.mock.calls[0][0].data).toMatchObject({ originalScore: 45, originalPercentage: 45, score: 80, percentage: 80 })
  })
  it('retains released digital retakes when correcting original and paper makeup grades', async () => {
    mocks.record.mockResolvedValue({ ...record, digitalRetakePercentage: 90, makeupScores: [{ id: 'attempt', percentage: 80 }] })
    expect((await patchOriginal(request({ score: 45 }), params)).status).toBe(200)
    expect(mocks.updateRecord.mock.calls[0][0].data).toMatchObject({ originalPercentage: 45, percentage: 90, score: 90 })
    mocks.updateRecord.mockClear()
    mocks.attempts.mockResolvedValue([{ percentage: 40 }])
    expect((await PATCH(request({ ...input, score: 40, attemptId: 'attempt' }), params)).status).toBe(200)
    expect(mocks.updateRecord.mock.calls[0][0].data).toEqual({ percentage: 90, score: 90 })
  })
  it('rejects an original grade exceeding the total before changing any score', async () => {
    expect((await patchOriginal(request({ score: 101 }), params)).status).toBe(400)
    expect(mocks.updateRecord).not.toHaveBeenCalled()
  })
  it('retries serialization conflicts rather than losing a concurrent grade', async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Conflict', { code: 'P2034', clientVersion: '6.19.3' }))
    expect((await POST(request(input), params)).status).toBe(201)
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })
})
