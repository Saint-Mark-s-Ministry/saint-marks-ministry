import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), existing: vi.fn(), notify: vi.fn(), conduct: vi.fn(), absences: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/attendance-audit', () => ({ recordAttendanceAudit: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyAttendanceRecorded: mocks.notify, notifyConductRemoval: mocks.conduct }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  lesson: { findUnique: async () => ({ id: 'lesson', title: 'Lesson', scheduledDate: new Date('2000-01-02') }) },
  attendanceRecord: { findMany: mocks.existing },
  studentEnrollment: { findMany: async () => [
    { studentId: 'a', isActive: true, status: 'ACTIVE', isAsyncStudent: false },
    { studentId: 'withdrawn', isActive: false, status: 'WITHDRAWN', isAsyncStudent: false },
    { studentId: 'graduated', isActive: false, status: 'GRADUATED', isAsyncStudent: false },
    { studentId: 'async', isActive: true, status: 'ACTIVE', isAsyncStudent: true },
  ] },
  expectedAbsence: { findMany: mocks.absences },
  user: { findMany: async () => [{ id: 'a', name: 'Student A' }] },
  $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ attendanceRecord: mocks }),
} }))
import { POST } from '@/app/api/attendance/batch/route'
const save = (body: object) => POST(new Request('http://localhost/api/attendance/batch', { method: 'POST', body: JSON.stringify(body) }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'staff', name: 'Staff', role: 'SERVANT_PREP' })
  mocks.existing.mockResolvedValue([])
  mocks.absences.mockResolvedValue([])
  mocks.notify.mockResolvedValue(undefined)
  mocks.conduct.mockResolvedValue(undefined)
})
describe('Prep attendance autosave endpoint', () => {
  it('saves only supplied, active in-person students and acknowledges stale roster entries', async () => {
    const response = await save({ lessonId: 'lesson', expectedUserId: 'staff', finalize: false,
      records: ['a', 'withdrawn', 'graduated', 'async', 'missing'].map(studentId => ({ studentId, status: 'PRESENT' })) })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, created: 1, skippedStudentIds: ['withdrawn', 'graduated', 'async', 'missing'] })
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ studentId: 'a', status: 'PRESENT' })] })
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('keeps whole-lesson notifications on deliberate Finish and legacy manual saves', async () => {
    expect((await save({ lessonId: 'lesson', records: [{ studentId: 'a', status: 'PRESENT' }] })).status).toBe(200)
    await vi.waitFor(() => expect(mocks.notify).toHaveBeenCalledOnce())
  })
  it('clears a removed note and arrival time when saving an edited row', async () => {
    mocks.existing.mockResolvedValue([{ id: 'existing-a', studentId: 'a', conductRemoval: false }])
    await save({ lessonId: 'lesson', finalize: false, records: [{ studentId: 'a', status: 'PRESENT', notes: null, arrivedAt: null }] })
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: null, arrivedAt: null, status: 'PRESENT' }) }))
  })
  it.each([false, true])('only notifies about a new conduct removal (previous removal: %s)', async alreadyRemoved => {
    mocks.existing.mockResolvedValue([{ id: 'existing-a', studentId: 'a', conductRemoval: alreadyRemoved }])
    await save({ lessonId: 'lesson', finalize: false, records: [{ studentId: 'a', status: 'ABSENT', conductRemoval: true, conductNote: 'Reason' }] })
    await vi.waitFor(() => expect(mocks.update).toHaveBeenCalled())
    expect(mocks.notify).not.toHaveBeenCalled()
    expect(mocks.conduct).toHaveBeenCalledTimes(alreadyRemoved ? 0 : 1)
  })
  it('retains expected-absence N/A handling during autosaves', async () => {
    mocks.absences.mockResolvedValue([{ id: 'absence', studentId: 'a', markAsNA: true, reason: 'Away' }])
    await save({ lessonId: 'lesson', finalize: false, records: [{ studentId: 'a', status: 'EXCUSED' }] })
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ expectedAbsenceId: 'absence', expectedAbsenceNA: true, status: 'EXCUSED', notes: 'Away' })] })
  })
  it('rejects a queued save after the signed-in account changes', async () => {
    expect((await save({ lessonId: 'lesson', expectedUserId: 'previous-staff', records: [{ studentId: 'a', status: 'PRESENT' }] })).status).toBe(403)
    expect(mocks.createMany).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
  it('does not grant write access to a student', async () => {
    mocks.auth.mockResolvedValue({ id: 'student', role: 'STUDENT' })
    expect((await save({ lessonId: 'lesson', records: [{ studentId: 'a', status: 'PRESENT' }] })).status).toBe(403)
    expect(mocks.createMany).not.toHaveBeenCalled()
  })
})
