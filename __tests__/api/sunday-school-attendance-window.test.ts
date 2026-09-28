import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  sessionFindUnique: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canServeClass: vi.fn(() => true),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolSession: { findUnique: mocks.sessionFindUnique },
  },
}))

import { POST } from '@/app/api/sunday-school/attendance/batch/route'

describe('Sunday School child attendance edit window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.sessionFindUnique.mockResolvedValue({
      id: 'session-1',
      classId: 'class-1',
      date: new Date('2000-01-02T00:00:00.000Z'),
      class: { academicYearId: 'year-1' },
    })
  })

  it('rejects changes after the session date', async () => {
    const response = await POST(new Request(
      'http://localhost/api/sunday-school/attendance/batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-1', records: [] }),
      }
    ))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Attendance can only be recorded on the session date',
    })
    expect(mocks.getSundaySchoolAccess).toHaveBeenCalledWith(
      { id: 'servant-1', role: 'SERVANT' },
      'year-1'
    )
  })
})
