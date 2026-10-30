import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  createMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'latest-user', name: 'Latest Servant', role: 'SUPER_ADMIN' }) }))
vi.mock('@/lib/roles', () => ({ canManageData: () => true }))
vi.mock('@/lib/attendance-audit', () => ({ recordAttendanceAudit: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyAttendanceRecorded: vi.fn(), notifyConductRemoval: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  lesson: { findUnique: async () => ({ id: 'lesson', title: 'Lesson', scheduledDate: new Date('2000-01-02') }) },
  attendanceRecord: { findMany: async () => [{ id: 'simple', studentId: 'a' }, { id: 'complex', studentId: 'b' }] },
  studentEnrollment: { findMany: async () => ['a','b','c'].map(studentId => ({ studentId, isActive: true, status: 'ACTIVE', isAsyncStudent: false })) }, expectedAbsence: { findMany: async () => [] },
  user: { findMany: async () => [] },
  $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ attendanceRecord: mocks }),
} }))
import { POST } from '@/app/api/attendance/batch/route'

describe('Prep attendance recorder', () => {
  beforeEach(() => vi.clearAllMocks())
  it('updates recorder attribution for status-only and detailed saves', async () => {
    const response = await POST(new Request('http://localhost/api/attendance/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId: 'lesson', records: [
        { studentId: 'a', status: 'PRESENT' }, { studentId: 'b', status: 'LATE', notes: 'Arrived late' },
        { studentId: 'c', status: 'ABSENT' },
      ] }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recordedBy: 'latest-user', updatedAt: expect.any(Date) }) }))
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recordedBy: 'latest-user', updatedAt: expect.any(Date) }) }))
    const body = await response.json()
    expect(body.lastSavedBy.recorder).toEqual({ id: 'latest-user', name: 'Latest Servant' })
  })
})
