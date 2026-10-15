import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'

vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    annualMentorInformation: { findMany: vi.fn() },
    registrationSubmission: { findMany: vi.fn() },
  },
}))

import { requireAuth } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/users/route'

const mockRequireAuth = vi.mocked(requireAuth)
const mockFindMany = vi.mocked(prisma.user.findMany)

describe('GET /api/users student roster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue({
      id: 'admin-1',
      role: UserRole.SUPER_ADMIN,
    } as never)
    mockFindMany.mockResolvedValue([])
    vi.mocked(prisma.annualMentorInformation.findMany).mockResolvedValue([])
    vi.mocked(prisma.registrationSubmission.findMany).mockResolvedValue([])
  })

  it('uses the same query to search names, email addresses, and phone numbers', async () => {
    const response = await GET(new Request('https://example.test/api/users?search=%20Liza%40Example.com%20'))

    expect(response.status).toBe(200)
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { name: { contains: 'Liza@Example.com', mode: 'insensitive' } },
          { email: { contains: 'Liza@Example.com', mode: 'insensitive' } },
          { phone: { contains: 'Liza@Example.com', mode: 'insensitive' } },
        ],
      },
    }))
  })

  it('returns the current submitted mentor and father of confession for the servant student roster', async () => {
    mockRequireAuth.mockResolvedValue({ id: 'servant', role: UserRole.SERVANT_PREP } as never)
    const father = { id: 'father', name: 'Fr. Test', phone: '555-0102', church: 'St. Mark' }
    mockFindMany.mockResolvedValue([{
      id: 'student', name: 'Test Student', enrollments: [{
        id: 'enrollment', mentorName: null, mentorPhone: null,
        mentor: { id: 'assigned', name: 'Previous Mentor', email: 'previous@example.com', phone: '555-0100' },
        fatherOfConfession: father,
      }],
    }] as never)
    vi.mocked(prisma.annualMentorInformation.findMany).mockResolvedValue([{
      studentId: 'student', mentorName: 'Current Mentor', mentorEmail: 'current@example.com', mentorPhone: '555-0101',
    }] as never)

    const response = await GET(new Request('https://example.test/api/users?role=STUDENT'))
    expect(response.status).toBe(200)
    const [student] = await response.json()
    expect(student.enrollments[0].mentorContact).toEqual({ name: 'Current Mentor', email: 'current@example.com', phone: '555-0101' })
    expect(student.enrollments[0].fatherOfConfession).toEqual(father)
    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { role: 'STUDENT' },
      select: expect.objectContaining({ enrollments: expect.objectContaining({ select: expect.objectContaining({
        fatherOfConfession: { select: { id: true, name: true, phone: true, church: true } },
      }) }) }),
    }))
  })

})
