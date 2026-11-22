import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), put: vi.fn(), del: vi.fn(),
  enrollment: vi.fn(), year: vi.fn(), slips: vi.fn(), existing: vi.fn(),
  create: vi.fn(), updateMany: vi.fn(), byId: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/authorization')>(), getAuthorizationContext: mocks.context }))
vi.mock('@vercel/blob', () => ({ put: mocks.put, del: mocks.del }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  studentEnrollment: { findUnique: mocks.enrollment },
  academicYear: { findFirst: mocks.year },
  studentSlip: { findMany: mocks.slips, findUnique: mocks.existing, create: mocks.create, updateMany: mocks.updateMany, findUniqueOrThrow: mocks.byId },
} }))
import { GET, POST } from '@/app/api/slips/mine/route'

const NOV = '2026-11-01T00:00:00.000Z'
const year = { id: 'year', name: '2026-2027', startDate: new Date('2026-09-01T00:00:00Z'), endDate: new Date('2027-06-30T00:00:00Z') }

function request({ periodStart = NOV, type = 'image/jpeg', size = 5, studentId }: { periodStart?: string; type?: string; size?: number; studentId?: string } = {}) {
  const data = new FormData()
  data.set('periodStart', periodStart)
  data.set('file', new File(['x'.repeat(size)], 'slip.jpg', { type }))
  if (studentId) data.set('studentId', studentId)
  return { formData: async () => data } as Request
}

describe('student confession slips API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-22T12:00:00Z'))
    mocks.auth.mockResolvedValue({ id: 'student-1' })
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SERVANTS_PREP_STUDENT]), disabled: false, readOnly: false })
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', attendanceStartDate: null, enrolledAt: new Date('2026-08-01'), academicYear: { startDate: year.startDate } })
    mocks.year.mockResolvedValue(year)
    mocks.slips.mockResolvedValue([])
    mocks.existing.mockResolvedValue(null)
    mocks.put.mockResolvedValue({ url: 'https://blob/new.jpg' })
    mocks.del.mockResolvedValue(undefined)
    mocks.create.mockImplementation(async ({ data }) => ({ id: 'slip-1', createdAt: new Date(), ...data }))
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.byId.mockResolvedValue({ id: 'slip-1', periodStart: new Date(NOV), imageUrl: 'https://blob/new.jpg', createdAt: new Date() })
  })
  afterEach(() => vi.useRealTimers())

  it('lists only the signed-in student’s confession slips', async () => {
    mocks.slips.mockResolvedValue([{ id: 's', periodStart: new Date(NOV), imageUrl: 'u', createdAt: new Date(), uploadedBy: 'servant' }])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(mocks.slips.mock.calls[0][0].where).toEqual({ studentId: 'student-1', type: 'CONFESSION' })
    const body = await res.json()
    expect(body.studentStart).toBe('2026-09-01T00:00:00.000Z')
    expect(body.slips[0]).toMatchObject({ id: 's', uploadedByMe: false })
    expect(body.slips[0]).not.toHaveProperty('uploadedBy')
  })

  it('denies accounts without the Servants Prep student tag', async () => {
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SUNDAY_SCHOOL_SERVANT]), disabled: false, readOnly: false })
    expect((await GET()).status).toBe(403)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('uploads for the current period under the authenticated student, ignoring a supplied studentId', async () => {
    const res = await POST(request({ studentId: 'someone-else' }))
    expect(res.status).toBe(201)
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ studentId: 'student-1', type: 'CONFESSION', periodStart: new Date(NOV), uploadedBy: 'student-1' })
    expect(mocks.put.mock.calls[0][0]).toMatch(/^slips\/confession\/student-1-\d+\.jpg$/)
  })

  it('allows a past period that was missed', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', attendanceStartDate: new Date('2026-08-15'), enrolledAt: new Date('2026-08-01'), academicYear: null })
    expect((await POST(request({ periodStart: '2026-09-01T00:00:00.000Z' }))).status).toBe(201)
  })

  it('rejects the registration period, future periods and dates that are not a period start', async () => {
    for (const periodStart of ['2026-09-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z', 'nope']) {
      expect((await POST(request({ periodStart }))).status).toBe(400)
    }
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('rejects unsupported and oversized files', async () => {
    expect((await POST(request({ type: 'text/html' }))).status).toBe(400)
    expect((await POST(request({ size: 5 * 1024 * 1024 }))).status).toBe(400)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('rejects students without an active enrollment', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: false, status: 'WITHDRAWN' })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('never replaces a slip a servant recorded', async () => {
    mocks.existing.mockResolvedValue({ id: 'slip-1', imageUrl: 'https://blob/old.jpg', uploadedBy: 'servant' })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('replaces the student’s own slip and deletes the old photo', async () => {
    mocks.existing.mockResolvedValue({ id: 'slip-1', imageUrl: 'https://blob/old.jpg', uploadedBy: 'student-1' })
    expect((await POST(request())).status).toBe(201)
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: 'slip-1', uploadedBy: 'student-1' })
    expect(mocks.del).toHaveBeenCalledWith('https://blob/old.jpg', expect.anything())
  })

  it('discards the new photo if a servant’s slip lands first', async () => {
    mocks.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }))
    expect((await POST(request())).status).toBe(409)
    expect(mocks.del).toHaveBeenCalledWith('https://blob/new.jpg', expect.anything())
  })
})
