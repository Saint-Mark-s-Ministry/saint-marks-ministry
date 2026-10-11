import { beforeEach, describe, expect, it, vi } from 'vitest'

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { annualMentorInformation: { findFirst } },
}))

import { getStudentMentorContact } from '@/lib/student-mentor-contact'

describe('student dashboard mentor contact', () => {
  const assigned = { name: 'Previous Mentor', email: 'previous@example.com', phone: '111' }
  const enrollment = { mentor: assigned, mentorName: 'New Mentor', mentorPhone: '222' }

  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockResolvedValue(null)
  })

  it('shows all confirmed contact fields instead of the old assigned account', async () => {
    findFirst.mockResolvedValue({
      mentorName: 'New Mentor', mentorEmail: 'new@example.com', mentorPhone: '222',
    })
    expect(await getStudentMentorContact('student-1', enrollment)).toEqual({
      name: 'New Mentor', email: 'new@example.com', phone: '222',
    })
    expect(findFirst).toHaveBeenCalledWith({
      where: { studentId: 'student-1', academicYear: { isActive: true } },
      orderBy: { submittedAt: 'desc' },
      select: { mentorName: true, mentorEmail: true, mentorPhone: true },
    })
    expect(enrollment.mentor).toEqual(assigned)
  })

  it('uses confirmed details even when no mentor account is assigned', async () => {
    findFirst.mockResolvedValue({
      mentorName: 'New Mentor', mentorEmail: 'new@example.com', mentorPhone: '222',
    })
    expect(await getStudentMentorContact('student-1', { ...enrollment, mentor: null }))
      .toEqual({ name: 'New Mentor', email: 'new@example.com', phone: '222' })
  })

  it('keeps the assigned contact when this year has no confirmation', async () => {
    expect(await getStudentMentorContact('student-1', enrollment)).toEqual(assigned)
  })

  it('falls back to submitted enrollment details for students without an assigned account', async () => {
    expect(await getStudentMentorContact('student-1', { ...enrollment, mentor: null }))
      .toEqual({ name: 'New Mentor', email: null, phone: '222' })
  })

  it('returns no contact when no mentor details exist', async () => {
    expect(await getStudentMentorContact('student-1', {
      mentor: null, mentorName: null, mentorPhone: null,
    })).toBeNull()
  })
})
