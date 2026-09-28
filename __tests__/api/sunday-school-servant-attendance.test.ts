import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolServantAttendanceStatus } from '@prisma/client'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  classFindUnique: vi.fn(),
  sessionFindUnique: vi.fn(),
  assignmentFindMany: vi.fn(),
  attendanceFindMany: vi.fn(),
  sessionUpsert: vi.fn(),
  attendanceUpsert: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canViewServantAttendance: (access: {
    isAdmin: boolean
    readOnly: boolean
    servantClassIds: Set<string>
    coordinatorClassIds: Set<string>
  }, classId: string) =>
    access.isAdmin || access.readOnly || access.servantClassIds.has(classId) || access.coordinatorClassIds.has(classId),
  canTakeServantAttendance: (access: {
    isAdmin: boolean
    readOnly: boolean
    servantClassIds: Set<string>
    coordinatorClassIds: Set<string>
  }, classId: string) =>
    access.isAdmin || (!access.readOnly && (
      access.servantClassIds.has(classId) || access.coordinatorClassIds.has(classId)
    )),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.classFindUnique },
    sundaySchoolSession: {
      findUnique: mocks.sessionFindUnique,
      upsert: mocks.sessionUpsert,
    },
    sundaySchoolServantAssignment: { findMany: mocks.assignmentFindMany },
    sundaySchoolServantAttendance: {
      findMany: mocks.attendanceFindMany,
      upsert: mocks.attendanceUpsert,
    },
    $transaction: mocks.transaction,
  },
}))

import { GET } from '@/app/api/sunday-school/servant-attendance/route'
import { POST } from '@/app/api/sunday-school/servant-attendance/batch/route'

const coordinatorAccess = {
  isAdmin: false,
  readOnly: false,
  servantClassIds: new Set<string>(),
  coordinatorClassIds: new Set(['class-1']),
}
const priestAccess = {
  isAdmin: false,
  readOnly: true,
  servantClassIds: new Set<string>(),
  coordinatorClassIds: new Set<string>(),
}
const servantAccess = {
  isAdmin: false,
  readOnly: false,
  servantClassIds: new Set(['class-1']),
  coordinatorClassIds: new Set<string>(),
}
const unrelatedServantAccess = {
  ...servantAccess,
  servantClassIds: new Set(['class-2']),
}
const currentSessionDate = getSundaySchoolTodayDateInputValue()

function saveRequest(records: Array<{ servantId: string; status: string }>) {
  return new Request('http://localhost/api/sunday-school/servant-attendance/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ classId: 'class-1', date: currentSessionDate, records }),
  })
}

describe('Sunday School servant attendance API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'coordinator-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue(coordinatorAccess)
    mocks.classFindUnique.mockResolvedValue({
      id: 'class-1',
      name: 'Grade 3 Boys',
      level: 'GRADE_3',
      academicYearId: 'year-1',
    })
    mocks.sessionFindUnique.mockResolvedValue(null)
    mocks.assignmentFindMany.mockResolvedValue([
      {
        userId: 'servant-1',
        authority: 'SERVANT',
        user: {
          id: 'servant-1',
          name: 'Marina Fahmy',
          email: 'servant@church.com',
          profileImageUrl: null,
        },
      },
    ])
    mocks.attendanceFindMany.mockResolvedValue([])
    mocks.sessionUpsert.mockResolvedValue({ id: 'session-1' })
    mocks.attendanceUpsert.mockResolvedValue({ id: 'mark-1' })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolSession: { upsert: mocks.sessionUpsert },
      sundaySchoolServantAttendance: {
        findMany: mocks.attendanceFindMany,
        upsert: mocks.attendanceUpsert,
      },
    }))
  })

  it('allows a class or age-group coordinator to load the roster', async () => {
    const response = await GET(new Request(
      `http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=${currentSessionDate}`
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.roster).toHaveLength(1)
    expect(body.roster[0].userId).toBe('servant-1')
    expect(mocks.assignmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ endedAt: null }),
    }))
  })

  it('allows a super admin to load any class roster', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN' })
    mocks.getSundaySchoolAccess.mockResolvedValue({
      ...servantAccess,
      isAdmin: true,
    })

    const response = await GET(new Request(
      `http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=${currentSessionDate}`
    ))

    expect(response.status).toBe(200)
  })

  it('allows a priest to load the roster in read-only mode', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getSundaySchoolAccess.mockResolvedValue(priestAccess)

    const response = await GET(new Request(
      `http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=${currentSessionDate}`
    ))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.canEdit).toBe(false)
    expect(body.roster).toHaveLength(1)
  })

  it('allows a class servant to load and record attendance for the whole class roster', async () => {
    mocks.getSundaySchoolAccess.mockResolvedValue(servantAccess)

    const loadResponse = await GET(new Request(
      `http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=${currentSessionDate}`
    ))
    const saveResponse = await POST(saveRequest([
      { servantId: 'servant-1', status: SundaySchoolServantAttendanceStatus.PRESENT },
    ]))

    expect(loadResponse.status).toBe(200)
    expect(saveResponse.status).toBe(200)
    expect(mocks.attendanceUpsert).toHaveBeenCalled()
  })

  it('refuses a servant who is not assigned to the requested class', async () => {
    mocks.getSundaySchoolAccess.mockResolvedValue(unrelatedServantAccess)

    const response = await GET(new Request(
      `http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=${currentSessionDate}`
    ))

    expect(response.status).toBe(403)
    expect(mocks.assignmentFindMany).not.toHaveBeenCalled()
  })

  it('keeps priest access read-only at the write endpoint', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'priest-1', role: 'PRIEST' })
    mocks.getSundaySchoolAccess.mockResolvedValue(priestAccess)

    const response = await POST(saveRequest([
      { servantId: 'servant-1', status: SundaySchoolServantAttendanceStatus.PRESENT },
    ]))

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects future dates and duplicate servants', async () => {
    const futureResponse = await POST(new Request(
      'http://localhost/api/sunday-school/servant-attendance/batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: 'class-1',
          date: '2999-01-01',
          records: [],
        }),
      }
    ))
    expect(futureResponse.status).toBe(400)

    const duplicateResponse = await POST(saveRequest([
      { servantId: 'servant-1', status: SundaySchoolServantAttendanceStatus.PRESENT },
      { servantId: 'servant-1', status: SundaySchoolServantAttendanceStatus.ABSENT },
    ]))
    expect(duplicateResponse.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps past servant attendance read-only', async () => {
    const loadResponse = await GET(new Request(
      'http://localhost/api/sunday-school/servant-attendance?classId=class-1&date=2000-01-02'
    ))
    expect((await loadResponse.json()).canEdit).toBe(false)

    const saveResponse = await POST(new Request(
      'http://localhost/api/sunday-school/servant-attendance/batch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: 'class-1',
          date: '2000-01-02',
          records: [{
            servantId: 'servant-1',
            status: SundaySchoolServantAttendanceStatus.PRESENT,
          }],
        }),
      }
    ))
    expect(saveResponse.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rejects unsupported statuses and users outside the current class roster', async () => {
    const invalidStatus = await POST(saveRequest([
      { servantId: 'servant-1', status: 'LATE' },
    ]))
    expect(invalidStatus.status).toBe(400)

    mocks.assignmentFindMany.mockResolvedValue([])
    const outsider = await POST(saveRequest([
      { servantId: 'outsider-1', status: SundaySchoolServantAttendanceStatus.PRESENT },
    ]))
    expect(outsider.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('upserts existing marks idempotently', async () => {
    mocks.assignmentFindMany.mockResolvedValue([{ userId: 'servant-1' }])
    mocks.attendanceFindMany.mockResolvedValue([{ servantId: 'servant-1' }])

    const response = await POST(saveRequest([
      { servantId: 'servant-1', status: SundaySchoolServantAttendanceStatus.ABSENT },
    ]))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ success: true, created: 0, updated: 1 })
    expect(mocks.assignmentFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ endedAt: null }),
    }))
    expect(mocks.attendanceUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        status: SundaySchoolServantAttendanceStatus.ABSENT,
        recordedBy: 'coordinator-1',
      },
    }))
  })
})
