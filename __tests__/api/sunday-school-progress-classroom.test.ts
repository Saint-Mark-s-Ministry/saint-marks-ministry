import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), assignments: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({
  prisma: { sundaySchoolAssignment: { findMany: mocks.assignments } },
}))

import { GET } from '@/app/api/sunday-school/progress/route'

describe('Async rotation classroom location', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1', role: 'STUDENT' })
    mocks.assignments.mockResolvedValue([{
      id: 'rotation-1', studentId: 'student-1', grade: 'GRADE_3', yearLevel: null,
      class: { id: 'class-1', name: 'Third Grade', level: 'GRADE_3', classroom: 'Room 203' },
      academicYear: { id: 'year-1', name: '2026-2027' },
      startDate: new Date('2026-10-17T00:00:00Z'), totalWeeks: 4,
      isActive: true, logs: [], rotationForm: null,
    }])
  })

  it('returns the current location with the student’s own rotation class', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/progress?studentId=student-1'))
    expect(response.status).toBe(200)
    expect((await response.json()).assignments[0].class).toMatchObject({ classroom: 'Room 203' })
    expect(mocks.assignments).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: 'student-1' },
      include: expect.objectContaining({ class: { select: { id: true, name: true, classroom: true, level: true } } }),
    }))
  })

  it('does not reveal another student’s class or location', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/progress?studentId=student-2'))
    expect(response.status).toBe(403)
    expect(mocks.assignments).not.toHaveBeenCalled()
  })
})
