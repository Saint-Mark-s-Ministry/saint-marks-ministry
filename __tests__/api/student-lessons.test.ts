import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  enrollmentFindUnique: vi.fn(),
  academicYearFindFirst: vi.fn(),
  lessonFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    studentEnrollment: { findUnique: mocks.enrollmentFindUnique },
    academicYear: { findFirst: mocks.academicYearFindFirst },
    lesson: { findMany: mocks.lessonFindMany },
  },
}))

import { GET } from '@/app/api/students/[id]/lessons/route'

const call = (id: string, query = '') =>
  GET(new Request(`http://localhost/api/students/${id}/lessons${query}`), { params: Promise.resolve({ id }) })

describe('GET /api/students/[id]/lessons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getServerSession.mockResolvedValue({ user: { id: 'student-1', role: 'STUDENT' } })
    mocks.enrollmentFindUnique.mockResolvedValue({ yearLevel: 'YEAR_2', isActive: true })
    mocks.lessonFindMany.mockResolvedValue([
      {
        id: 'lesson-2',
        title: 'Prayer',
        lessonNumber: 2,
        scheduledDate: new Date('2026-10-02T23:30:00.000Z'),
        status: 'CANCELLED',
        cancellationReason: 'Retreat weekend',
        resources: [],
        attendanceRecords: [],
      },
    ])
  })

  it('hides cancelled lessons by default, as the web page expects', async () => {
    await call('student-1')

    expect(mocks.lessonFindMany.mock.calls[0][0].where.status).toEqual({ notIn: ['CANCELLED', 'NO_CLASS'] })
  })

  it('returns cancelled lessons with their reason when the mobile screen asks', async () => {
    const response = await call('student-1', '?includeCancelled=true')
    const body = await response.json()

    expect(mocks.lessonFindMany.mock.calls[0][0].where.status).toEqual({ notIn: ['NO_CLASS'] })
    expect(body[0]).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Retreat weekend' })
  })

  it('refuses a student asking for another student, without reading lessons', async () => {
    const response = await call('student-2', '?includeCancelled=true')

    expect(response.status).toBe(403)
    expect(mocks.lessonFindMany).not.toHaveBeenCalled()
  })
})
