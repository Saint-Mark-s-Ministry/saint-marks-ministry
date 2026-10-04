import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  classFindUnique: vi.fn(),
  sessionFindUnique: vi.fn(),
  childFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  sessionUpdate: vi.fn(),
  transaction: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canServeClass: vi.fn(() => true),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.classFindUnique },
    sundaySchoolSession: {
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
    },
    sundaySchoolChild: { findMany: mocks.childFindMany },
    sundaySchoolChildAttendance: { findMany: mocks.attendanceFindMany },
    $transaction: mocks.transaction,
  },
}))

import { POST as saveAttendance } from '@/app/api/sunday-school/attendance/batch/route'
import { POST as openSession } from '@/app/api/sunday-school/sessions/route'

describe('Sunday School child attendance edit window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.classFindUnique.mockResolvedValue({ id: 'class-1', academicYearId: 'year-1' })
    mocks.sessionFindUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      date: new Date('2000-01-02T00:00:00.000Z'),
      class: { academicYearId: 'year-1' },
    })
    mocks.childFindMany.mockResolvedValue([])
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.sessionUpdate.mockResolvedValue({ id: 'session-1' })
    mocks.transaction.mockImplementation(async (callback) => callback({
      sundaySchoolChildAttendance: {
        createMany: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
      sundaySchoolSession: { update: mocks.sessionUpdate },
    }))
  })

  it('allows child attendance to be saved after the session date', async () => {
    const response = await saveAttendance(new Request(
      'http://localhost/api/sunday-school/attendance/batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-1', records: [] }),
      }
    ))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, created: 0, updated: 0 })
    expect(mocks.getSundaySchoolAccess).toHaveBeenCalledWith(
      { id: 'servant-1', role: 'SERVANT' },
      'year-1'
    )
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { takenBy: 'servant-1' },
    })
  })

  it('allows an existing child attendance session to be opened after its date', async () => {
    const response = await openSession(new Request(
      'http://localhost/api/sunday-school/sessions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId: 'class-1', date: '2000-01-02' }),
      }
    ))

    expect(response.status).toBe(200)
    expect((await response.json()).id).toBe('session-1')
  })
})
