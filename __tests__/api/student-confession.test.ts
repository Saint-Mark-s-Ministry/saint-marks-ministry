import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  enrollmentFindUnique: vi.fn(),
  academicYearFindFirst: vi.fn(),
  slipFindMany: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    studentEnrollment: { findUnique: mocks.enrollmentFindUnique },
    academicYear: { findFirst: mocks.academicYearFindFirst },
    studentSlip: { findMany: mocks.slipFindMany },
  },
}))

import { GET } from '@/app/api/students/[id]/confession/route'

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const request = () => new Request('http://localhost/api/students/x/confession')

describe('GET /api/students/[id]/confession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enrollmentFindUnique.mockResolvedValue({
      mentorId: 'mentor-1',
      attendanceStartDate: null,
      enrolledAt: new Date('2025-07-15T00:00:00.000Z'),
      academicYear: { startDate: new Date('2025-09-01T00:00:00.000Z') },
    })
    mocks.academicYearFindFirst.mockResolvedValue({
      id: 'year-1',
      name: '2025–26',
      startDate: new Date('2025-09-01T00:00:00.000Z'),
      endDate: new Date('2026-06-30T00:00:00.000Z'),
    })
    mocks.slipFindMany.mockResolvedValue([
      { periodStart: new Date('2025-09-01T00:00:00.000Z'), createdAt: new Date('2025-10-03T12:00:00.000Z') },
    ])
  })

  it('lets a student read their own statuses without slip images', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT })

    const response = await GET(request(), params('student-1'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.academicYear).toEqual({ id: 'year-1', name: '2025–26' })
    expect(body.periods[0]).toMatchObject({ start: '2025-09-01T00:00:00.000Z', status: 'slip', uploadedAt: '2025-10-03T12:00:00.000Z' })
    expect(JSON.stringify(body)).not.toContain('imageUrl')
    // The slip query must not select the image URL either.
    expect(mocks.slipFindMany.mock.calls[0][0].select).not.toHaveProperty('imageUrl')
  })

  it('refuses a student asking for another student, without touching the database', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT })

    const response = await GET(request(), params('student-2'))

    expect(response.status).toBe(403)
    expect(mocks.enrollmentFindUnique).not.toHaveBeenCalled()
    expect(mocks.slipFindMany).not.toHaveBeenCalled()
  })

  it('refuses a mentor asking for a student who is not their mentee', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'mentor-2', role: UserRole.MENTOR })

    const response = await GET(request(), params('student-1'))

    expect(response.status).toBe(403)
    expect(mocks.slipFindMany).not.toHaveBeenCalled()
  })

  it('reports not-enrolled students with the message the app keys its empty state on', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT })
    mocks.enrollmentFindUnique.mockResolvedValue(null)

    const response = await GET(request(), params('student-1'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Enrollment not found' })
  })
})
