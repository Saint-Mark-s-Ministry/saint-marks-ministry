import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  enrollment: vi.fn(), enrollments: vi.fn(), create: vi.fn(), update: vi.fn(),
  createMany: vi.fn(), updateMany: vi.fn(), read: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => ({ id: 'admin', role: 'SUPER_ADMIN' }) }))
vi.mock('@/lib/attendance-audit', () => ({ recordAttendanceAudit: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notifyAttendanceRecorded: vi.fn(), notifyConductRemoval: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  studentEnrollment: { findUnique: mocks.enrollment, findMany: mocks.enrollments },
  attendanceRecord: {
    findUnique: async () => ({ id: 'record', studentId: 'async', lessonId: 'lesson', lesson: { title: 'Lesson', scheduledDate: new Date('2026-10-02') } }),
    findMany: mocks.read, create: mocks.create, update: mocks.update,
  },
  lesson: { findUnique: async () => ({ id: 'lesson', title: 'Lesson', scheduledDate: new Date('2026-10-02') }) },
  expectedAbsence: { findMany: async () => [] },
  user: { findMany: async () => [] },
  $transaction: async (callback: (tx: unknown) => Promise<void>) => callback({ attendanceRecord: mocks }),
} }))
import { GET, POST } from '@/app/api/attendance/route'
import { PATCH } from '@/app/api/attendance/[id]/route'
import { POST as batch } from '@/app/api/attendance/batch/route'

const request = (body: unknown) => new Request('http://localhost/api/attendance', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enrollment.mockResolvedValue({ isAsyncStudent: true })
  mocks.enrollments.mockResolvedValue([{ studentId: 'async', isAsyncStudent: true, asyncApprovedAt: null }])
  mocks.read.mockResolvedValue([])
})

describe('Prep attendance excludes currently async students', () => {
  it('rejects direct lesson attendance creation', async () => {
    expect((await POST(request({ studentId: 'async', lessonId: 'lesson', status: 'ABSENT' }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects stale direct edits to an async student lesson record', async () => {
    expect((await PATCH(request({ status: 'ABSENT' }), { params: Promise.resolve({ id: 'record' }) })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([null, '2026-10-15T18:00:00Z'])(
    'ignores stale batch roll call entries even for lessons before approval (%s)', async asyncApprovedAt => {
      mocks.enrollments.mockResolvedValue([{ studentId: 'async', isAsyncStudent: true, asyncApprovedAt }])
      const response = await batch(request({ lessonId: 'lesson', records: [{ studentId: 'async', status: 'ABSENT' }] }))
      expect(response.status).toBe(200)
      expect(mocks.createMany).not.toHaveBeenCalled()
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.updateMany).not.toHaveBeenCalled()
    },
  )

  it('excludes async lesson records while retaining student and mentor query constraints', async () => {
    expect((await GET(new Request('http://localhost/api/attendance?studentId=regular&lessonId=lesson'))).status).toBe(200)
    expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ where: {
      studentId: 'regular', lessonId: 'lesson', AND: [{ student: { enrollments: { none: { isAsyncStudent: true } } } }],
    } }))
  })
})
