import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  sessionFindUnique: vi.fn(),
  childFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  transaction: vi.fn(),
  recordAttendanceAudit: vi.fn(),
}))

vi.mock('@/lib/attendance-audit', () => ({ recordAttendanceAudit: mocks.recordAttendanceAudit }))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canServeClass: () => true,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolSession: { findUnique: mocks.sessionFindUnique },
    sundaySchoolChild: { findMany: mocks.childFindMany },
    sundaySchoolChildAttendance: { findMany: mocks.attendanceFindMany },
    $transaction: mocks.transaction,
  },
}))

import { POST } from '@/app/api/sunday-school/attendance/batch/route'

describe('Sunday School child attendance API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue({ servantClassIds: new Set(['class-1']) })
    mocks.sessionFindUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      date: new Date('2026-10-11'),
      class: { academicYearId: 'year-1', name: 'Grade 3' },
    })
  })

  it('rejects Excused because Sunday School attendance is no longer excused', async () => {
    const response = await POST(new Request(
      'http://localhost/api/sunday-school/attendance/batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'session-1',
          records: [{ childId: 'child-1', status: 'EXCUSED' }],
        }),
      }
    ))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid status. Must be one of: PRESENT, LATE, ABSENT')
    expect(mocks.childFindMany).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.recordAttendanceAudit).not.toHaveBeenCalled()
  })
  it('logs a successful class save once with the authenticated recorder', async () => {
    mocks.childFindMany.mockResolvedValue([{ id: 'child-1' }, { id: 'child-2' }])
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.transaction.mockResolvedValue(undefined)
    const response = await POST(new Request('http://localhost/api/sunday-school/attendance/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-1', records: [
        { childId: 'child-1', status: 'PRESENT' }, { childId: 'child-2', status: 'ABSENT' },
      ] }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.recordAttendanceAudit).toHaveBeenCalledOnce()
    expect(mocks.recordAttendanceAudit).toHaveBeenCalledWith({
      actorUserId: 'servant-1', action: 'attendance.sunday_school_children.save',
      entityType: 'SundaySchoolSession', entityId: 'session-1', targetName: 'Grade 3',
      attendanceDate: new Date('2026-10-11'), personIds: ['child-1', 'child-2'],
    })
    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordAttendanceAudit.mock.invocationCallOrder[0])
  })

})
