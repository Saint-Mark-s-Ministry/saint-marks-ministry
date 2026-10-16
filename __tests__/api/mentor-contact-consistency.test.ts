vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: async () => null }))
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), users: vi.fn(), user: vi.fn(), enrollments: vi.fn(),
  annual: vi.fn(), applications: vi.fn(), count: vi.fn(), empty: vi.fn(),
  current: vi.fn(), update: vi.fn(), create: vi.fn(), existing: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findMany: mocks.users, findUnique: mocks.user, count: mocks.count },
  studentEnrollment: { findMany: mocks.enrollments, count: mocks.count, findUnique: mocks.existing },
  $transaction: mocks.transaction,
  annualMentorInformation: { findMany: mocks.annual },
  registrationSubmission: { findMany: mocks.applications },
  examScore: { findMany: mocks.empty }, attendanceRecord: { findMany: mocks.empty },
  exam: { findMany: mocks.empty }, lesson: { findMany: mocks.empty },
} }))

import { GET as users } from '@/app/api/users/route'
import { GET as enrollments, POST as createEnrollment } from '@/app/api/enrollments/route'
import { PATCH as updateEnrollment } from '@/app/api/enrollments/[id]/route'
import { GET as details } from '@/app/api/students/[id]/details/route'

const enrollment = {
  id: 'enrollment', studentId: 'mark', yearLevel: 'YEAR_2', isAsyncStudent: false,
  mentorId: 'old', mentorName: 'Mina Beshy', mentorPhone: '222',
  mentor: { id: 'old', name: 'Marcellino Boles', email: 'previous@example.com', phone: '111' },
}
const student = { id: 'mark', name: 'Mark Narouz', enrollments: [enrollment] }
const expected = { name: 'Mina Beshy', email: 'mina@example.com', phone: '222' }

describe('mentor contact API consistency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
    mocks.users.mockResolvedValue([student])
    mocks.user.mockResolvedValue(student)
    mocks.enrollments.mockResolvedValue([enrollment])
    mocks.count.mockResolvedValue(1)
    mocks.empty.mockResolvedValue([])
    mocks.applications.mockResolvedValue([])
    mocks.annual.mockResolvedValue([{
      studentId: 'mark', mentorName: expected.name, mentorEmail: expected.email, mentorPhone: expected.phone,
    }])
    mocks.current.mockResolvedValue(enrollment)
    mocks.update.mockResolvedValue(enrollment)
    mocks.create.mockResolvedValue(enrollment)
    mocks.existing.mockResolvedValue(null)
    mocks.transaction.mockImplementation(async callback => callback({
      studentEnrollment: { findUniqueOrThrow: mocks.current, update: mocks.update, create: mocks.create },
      lesson: { findMany: mocks.empty },
    }))
  })

  it.each(['', '?page=1'])('returns the confirmed mentor on the admin roster %s', async query => {
    const response = await users(new Request(`https://example.test/api/users${query}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    const record = (query ? body.data : body)[0]
    expect(record.enrollments[0].mentorContact).toEqual(expected)
    expect(record.enrollments[0].mentorId).toBe('old')
  })

  it.each(['', '?page=1'])('returns the same contact on the enrollment roster %s', async query => {
    const response = await enrollments(new Request(`https://example.test/api/enrollments${query}`))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect((query ? body.data : body)[0].mentorContact).toEqual(expected)
  })

  it('returns the same contact in student details and the program editor', async () => {
    const response = await details(new Request('https://example.test/api/students/mark/details'), { params: Promise.resolve({ id: 'mark' }) })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.student.enrollments[0].mentorContact).toEqual(expected)
    expect(body.student.enrollments[0].mentor.name).toBe('Marcellino Boles')
  })

  it('preserves the mentor roster scope based on actual account assignments', async () => {
    mocks.auth.mockResolvedValue({ id: 'mentor', role: 'MENTOR' })
    const response = await users(new Request('https://example.test/api/users?role=STUDENT'))
    expect(response.status).toBe(200)
    expect(mocks.users).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'STUDENT', enrollments: { some: { mentorId: 'mentor' } } },
    }))
  })

  it('preserves the confirmed contact after an unrelated enrollment edit', async () => {
    const response = await updateEnrollment(new Request('https://example.test/api/enrollments/enrollment', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: 'Updated' }),
    }), { params: Promise.resolve({ id: 'enrollment' }) })
    expect(response.status).toBe(200)
    expect((await response.json()).mentorContact).toEqual(expected)
  })

  it('returns a resolved contact when creating an enrollment', async () => {
    const response = await createEnrollment(new Request('https://example.test/api/enrollments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'mark', yearLevel: 'YEAR_2', academicYearId: 'year' }),
    }))
    expect(response.status).toBe(201)
    expect((await response.json()).mentorContact).toEqual(expected)
  })

  it('does not load contacts when an unauthorized student requests an admin view', async () => {
    mocks.auth.mockResolvedValue({ id: 'other', role: 'STUDENT' })
    expect((await users(new Request('https://example.test/api/users'))).status).toBe(403)
    expect((await enrollments(new Request('https://example.test/api/enrollments'))).status).toBe(403)
    expect((await details(new Request('https://example.test/api/students/mark/details'), { params: Promise.resolve({ id: 'mark' }) })).status).toBe(403)
    expect(mocks.annual).not.toHaveBeenCalled()
    expect(mocks.applications).not.toHaveBeenCalled()
  })
})
