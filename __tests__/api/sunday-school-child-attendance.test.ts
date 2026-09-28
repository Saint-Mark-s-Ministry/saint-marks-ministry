import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  sessionFindUnique: vi.fn(),
  childFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  transaction: vi.fn(),
}))

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
      date: new Date(`${getSundaySchoolTodayDateInputValue()}T00:00:00.000Z`),
      class: { academicYearId: 'year-1' },
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
  })
})
