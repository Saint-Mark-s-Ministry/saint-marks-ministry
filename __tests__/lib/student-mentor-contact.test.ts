import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ annual: vi.fn(), applications: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  annualMentorInformation: { findMany: mocks.annual },
  registrationSubmission: { findMany: mocks.applications },
} }))

import { getStudentMentorContact, withEnrollmentMentorContacts, withUserMentorContacts } from '@/lib/student-mentor-contact'

const assigned = { id: 'old', name: 'Marcellino Boles', email: 'previous@example.com', phone: '111' }
const enrollment = { studentId: 'mark', mentorId: 'old', mentor: assigned, mentorName: 'Mina Beshy', mentorPhone: '222' }
const confirmed = { studentId: 'mark', mentorName: 'Mina Beshy', mentorEmail: 'mina@example.com', mentorPhone: '222', updatedAt: new Date('2026-10-24T00:00:00Z'), submittedAt: new Date('2026-10-24T00:00:00Z'), reviewedAt: null }
const expected = { name: 'Mina Beshy', email: 'mina@example.com', phone: '222' }

describe('mentor contacts across all student views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.annual.mockResolvedValue([])
    mocks.applications.mockResolvedValue([])
  })

  it('uses the whole current-year confirmation on the dashboard, roster, and details', async () => {
    mocks.annual.mockResolvedValue([confirmed])
    mocks.applications.mockResolvedValue([{ createdUserId: 'mark', mentorName: 'Older Mentor', mentorPhone: '333', mentorEmail: 'older@example.com' }])
    expect(await getStudentMentorContact('mark', enrollment)).toEqual(expected)
    const [roster] = await withEnrollmentMentorContacts([enrollment])
    const [student] = await withUserMentorContacts([{ id: 'mark', enrollments: [enrollment] }])
    expect(roster.mentorContact).toEqual(expected)
    expect(student.enrollments?.[0].mentorContact).toEqual(expected)
    expect(roster.mentorId).toBe('old')
    expect(student.enrollments?.[0].mentor).toEqual(assigned)
  })

  it('retains the updated application contact when the academic year rolls over', async () => {
    mocks.applications.mockResolvedValue([{ ...confirmed, createdUserId: 'mark' }])
    expect(await getStudentMentorContact('mark', enrollment)).toEqual(expected)
    expect(mocks.applications).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdUserId: { in: ['mark'] }, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    }))
  })

  it('batches a whole roster and keeps different students separate', async () => {
    mocks.annual.mockResolvedValue([confirmed])
    const result = await withEnrollmentMentorContacts([enrollment, { ...enrollment, studentId: 'other', mentorName: null }])
    expect(result[0].mentorContact).toEqual(expected)
    expect(result[1].mentorContact?.name).toBe('Marcellino Boles')
    expect(mocks.annual).toHaveBeenCalledTimes(1)
    expect(mocks.applications).toHaveBeenCalledTimes(1)
    expect(mocks.annual).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: { in: ['mark', 'other'] }, academicYear: { isActive: true } },
    }))
  })

  it('uses the latest nonempty approved application without mixing contacts', async () => {
    mocks.applications.mockResolvedValue([
      { createdUserId: 'mark', mentorName: null, mentorEmail: null, mentorPhone: null },
      { createdUserId: 'mark', mentorName: 'Mina Beshy', mentorEmail: null, mentorPhone: '222' },
      { createdUserId: 'mark', mentorName: 'Older Mentor', mentorEmail: 'old@example.com', mentorPhone: '333' },
    ])
    expect(await getStudentMentorContact('mark', enrollment)).toEqual({ name: 'Mina Beshy', email: null, phone: '222' })
  })

  it('supports confirmed mentors without accounts', async () => {
    mocks.annual.mockResolvedValue([confirmed])
    expect(await getStudentMentorContact('mark', { ...enrollment, mentor: null })).toEqual(expected)
  })

  it('falls back to the assigned account when no submitted contact exists', async () => {
    expect(await getStudentMentorContact('mark', { ...enrollment, mentorName: null })).toEqual({ name: assigned.name, email: assigned.email, phone: assigned.phone })
  })

  it('falls back to enrollment details without an account', async () => {
    expect(await getStudentMentorContact('mark', { ...enrollment, mentor: null })).toEqual({ name: 'Mina Beshy', email: null, phone: '222' })
  })

  it('retains a legacy student’s updated enrollment details after year rollover', async () => {
    expect(await getStudentMentorContact('mark', enrollment)).toEqual({ name: 'Mina Beshy', email: null, phone: '222' })
  })

  it('does not query or expose contacts for users without enrollments', async () => {
    expect(await withUserMentorContacts([{ id: 'admin', enrollments: [] }])).toEqual([{ id: 'admin', enrollments: [] }])
    expect(mocks.annual).not.toHaveBeenCalled()
    expect(mocks.applications).not.toHaveBeenCalled()
  })

  it('returns null when no contact exists', async () => {
    expect(await getStudentMentorContact('mark', { mentor: null, mentorName: null, mentorPhone: null })).toBeNull()
  })

  it.each([
    { isActive: true, status: 'ACTIVE' as const },
    { isActive: false, status: 'WITHDRAWN' as const },
  ])('keeps Year 2 contacts and assignments empty without this year form: %o', async (state) => {
    mocks.applications.mockResolvedValue([{ ...confirmed, createdUserId: 'mark' }])
    const yearTwo = { ...enrollment, yearLevel: 'YEAR_2' as const, ...state }
    expect(await getStudentMentorContact('mark', yearTwo)).toBeNull()
    const [row] = await withEnrollmentMentorContacts([yearTwo])
    expect(row).toMatchObject({ mentor: null, mentorId: null, mentorName: null, mentorPhone: null, mentorContact: null, mentorForm: { status: 'REQUIRED', submission: null } })
  })

  it.each([
    { isActive: true, status: 'ACTIVE' as const },
    { isActive: false, status: 'WITHDRAWN' as const },
  ])('exposes the Year 2 submission version for review: %o', async (state) => {
    mocks.annual.mockResolvedValue([confirmed])
    const [row] = await withEnrollmentMentorContacts([{ ...enrollment, yearLevel: 'YEAR_2' as const, ...state }])
    expect(row.mentorContact).toEqual(expected)
    expect(row.mentorForm).toMatchObject({ status: 'PENDING_REVIEW', submission: { ...expected, updatedAt: confirmed.updatedAt.toISOString() } })
  })
  it('preserves historical contacts without renewal controls for graduated Year 2 students', async () => {
    mocks.applications.mockResolvedValue([{ ...confirmed, createdUserId: 'mark' }])
    const [row] = await withEnrollmentMentorContacts([{
      ...enrollment, yearLevel: 'YEAR_2' as const, isActive: false, status: 'GRADUATED' as const,
    }])
    expect(row.mentorContact).toEqual(expected)
    expect(row.mentorForm).toBeNull()
  })

})
