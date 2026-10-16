import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/student-mentor-contact', () => ({
  withEnrollmentMentorContacts: async (enrollments: unknown[]) => enrollments,
}))

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), transaction: vi.fn(), current: vi.fn(), existing: vi.fn(),
  update: vi.fn(), create: vi.fn(), activeYear: vi.fn(), backfill: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: mocks.transaction,
  studentEnrollment: { findUnique: mocks.existing },
  academicYear: { findFirst: mocks.activeYear },
} }))
vi.mock('@/lib/notifications', () => ({ notifyMentorAssigned: vi.fn() }))
vi.mock('@/lib/api-utils', () => ({
  backfillAttendanceForStudent: mocks.backfill,
  enrollmentStatusUpdate: vi.fn(), reconcileLateStartAttendance: vi.fn(),
}))

import { POST } from '@/app/api/enrollments/route'
import { PATCH } from '@/app/api/enrollments/[id]/route'

const tx = { studentEnrollment: { findUniqueOrThrow: mocks.current, create: mocks.create, update: mocks.update } }
const request = (body: object) => new Request('http://localhost/api/enrollments', { method: 'POST', body: JSON.stringify(body) })
const patch = (body: object) => PATCH(request(body), { params: Promise.resolve({ id: 'enrollment' }) })

describe('enrollment year API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.transaction.mockImplementation(work => work(tx))
    mocks.current.mockResolvedValue({ yearLevel: 'YEAR_1', isAsyncStudent: false, mentorId: null })
    mocks.existing.mockResolvedValue(null)
    mocks.activeYear.mockResolvedValue({ id: 'academic-year' })
    mocks.create.mockResolvedValue({ id: 'enrollment', studentId: 'student' })
    mocks.update.mockResolvedValue({ id: 'enrollment', studentId: 'student' })
  })

  it('creates an approved async enrollment without a cohort year', async () => {
    expect((await POST(request({ studentId: 'student', isAsyncStudent: true }))).status).toBe(201)
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({
      yearLevel: null, isAsyncStudent: true, asyncApprovedBy: 'admin', asyncApprovedAt: expect.any(Date),
    })
  })
  it('requires a year for a regular enrollment', async () => {
    expect((await POST(request({ studentId: 'student' }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('clears the year in the same write that marks a student async', async () => {
    expect((await patch({ isAsyncStudent: true })).status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ yearLevel: null, isAsyncStudent: true })
  })
  it('rejects a year-only update for an async student', async () => {
    mocks.current.mockResolvedValue({ yearLevel: null, isAsyncStudent: true, mentorId: null })
    expect((await patch({ yearLevel: 'YEAR_2' })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('requires a selected year to return to in-person and writes both together', async () => {
    mocks.current.mockResolvedValue({ yearLevel: null, isAsyncStudent: true, mentorId: null })
    expect((await patch({ isAsyncStudent: false })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
    expect((await patch({ isAsyncStudent: false, yearLevel: 'YEAR_2' })).status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toMatchObject({ yearLevel: 'YEAR_2', isAsyncStudent: false, asyncApprovedAt: null })
  })
  it('allows unrelated edits to a yearless enrollment', async () => {
    mocks.current.mockResolvedValue({ yearLevel: null, isAsyncStudent: true, mentorId: null })
    expect((await patch({ notes: 'Updated note' })).status).toBe(200)
    expect(mocks.update.mock.calls[0][0].data).toEqual({ notes: 'Updated note' })
  })
  it('allows priests to create and update async enrollments', async () => {
    mocks.auth.mockResolvedValue({ id: 'priest', role: 'PRIEST' })
    expect((await POST(request({ studentId: 'student', isAsyncStudent: true }))).status).toBe(201)
    expect((await patch({ isAsyncStudent: true })).status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalled()
  })
})
