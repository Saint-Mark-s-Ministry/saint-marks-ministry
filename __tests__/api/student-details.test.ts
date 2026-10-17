import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), student: vi.fn(), scores: vi.fn(), attendance: vi.fn(), exams: vi.fn(), lessons: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/student-mentor-contact', () => ({ withUserMentorContacts: async (students: unknown[]) => students }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.student }, examScore: { findMany: mocks.scores },
  attendanceRecord: { findMany: mocks.attendance }, exam: { findMany: mocks.exams }, lesson: { findMany: mocks.lessons },
} }))
import { GET } from '@/app/api/students/[id]/details/route'

const getDetails = (query = '') => GET(new Request(`http://localhost/api/students/nori/details${query}`), { params: Promise.resolve({ id: 'nori' }) })

describe('student profile details API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: UserRole.SUPER_ADMIN })
    mocks.student.mockResolvedValue({ id: 'nori', name: 'Nori', enrollments: [{ yearLevel: 'YEAR_2' }] })
    for (const mock of [mocks.scores, mocks.attendance, mocks.exams, mocks.lessons]) mock.mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each([UserRole.SUPER_ADMIN, UserRole.SERVANT_PREP, UserRole.PRIEST])('allows %s to read the profile', async role => {
    mocks.auth.mockResolvedValue({ id: 'viewer', role })
    expect((await getDetails()).status).toBe(200)
    expect(mocks.student).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'nori' } }))
  })

  it.each([UserRole.SERVANT, UserRole.STUDENT, UserRole.MENTOR])('denies %s without querying profile data', async role => {
    mocks.auth.mockResolvedValue({ id: 'viewer', role })
    expect((await getDetails('?fullHistory=true')).status).toBe(403)
    expect(mocks.student).not.toHaveBeenCalled()
  })

  it('returns 401 when signed out', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await getDetails()).status).toBe(401)
    expect(mocks.student).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing student', async () => {
    mocks.student.mockResolvedValue(null)
    expect((await getDetails()).status).toBe(404)
    expect(mocks.scores).not.toHaveBeenCalled()
  })

  it('includes historical exams from both program years on the full profile', async () => {
    expect((await getDetails('?fullHistory=true')).status).toBe(200)
    expect(mocks.exams.mock.calls[0][0]).toMatchObject({ where: { yearLevel: { in: ['YEAR_1', 'YEAR_2', 'BOTH'] }, examDate: undefined }, take: undefined })
    expect(mocks.lessons.mock.calls[0][0]).toMatchObject({ where: { scheduledDate: undefined }, take: undefined })
    expect(mocks.scores.mock.calls[0][0].where).toMatchObject({ studentId: 'nori', exam: {} })
    expect(mocks.attendance.mock.calls[0][0].where.studentId).toBe('nori')
  })

  it('retains year filtering and recent candidates for quick editing', async () => {
    await getDetails('?academicYearId=year')
    expect(mocks.exams.mock.calls[0][0]).toMatchObject({ where: { academicYearId: 'year', examDate: { gte: expect.any(Date) } }, take: 50 })
    expect(mocks.scores.mock.calls[0][0].where.exam).toEqual({ academicYearId: 'year' })
  })
})
