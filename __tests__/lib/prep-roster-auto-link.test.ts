import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Prisma } from '@prisma/client'
import { autoLinkPrepStudentToRoster, PrepRosterLinkConflictError } from '@/lib/prep-roster-auto-link'

const student = { id: 'prep-1', name: 'Mina Mark', createdFromRegistration: [{ grade: 'GRADE_11', dateOfBirth: new Date('2009-03-02') }] }
const child = { id: 'child-1', firstName: 'Mina', lastName: 'Mark', level: 'GRADE_11', birthDate: new Date('2009-03-02'), userId: null, isActive: true, status: 'ACTIVE' }
const accounts = vi.fn()
const children = vi.fn()
const update = vi.fn()
const audit = vi.fn()
const tx = { user: { findMany: accounts }, sundaySchoolChild: { findMany: children, updateMany: update }, auditEvent: { create: audit } } as unknown as Prisma.TransactionClient
const link = () => autoLinkPrepStudentToRoster(tx, student.id, 'reviewer-1', 'registration-1')
beforeEach(() => {
  vi.resetAllMocks()
  accounts.mockResolvedValue([student])
  children.mockResolvedValue([child])
  update.mockResolvedValue({ count: 1 })
  audit.mockResolvedValue({})
})
describe('automatic Prep student roster linking', () => {
  it('links a verified student and audits the identity decision without changing other roster data', async () => {
    expect(await link()).toEqual({ status: 'linked', reason: 'Linked to the verified Sunday School student roster record' })
    expect(update).toHaveBeenCalledWith({
      where: { id: child.id, userId: null, isActive: true, status: 'ACTIVE', firstName: 'Mina', lastName: 'Mark', birthDate: child.birthDate, level: 'GRADE_11' },
      data: { userId: student.id },
    })
    expect(audit).toHaveBeenCalledWith({ data: {
      actorUserId: 'reviewer-1', action: 'sunday_school.prep_roster.auto_link', entityType: 'SundaySchoolChild', entityId: child.id, result: 'SUCCESS',
      metadata: { studentId: student.id, registrationId: 'registration-1', verification: 'unique_full_name_birth_date_grade' },
    } })
  })
  it('checks enabled active Prep students against the latest approved registration', async () => {
    await link()
    expect(accounts).toHaveBeenCalledWith(expect.objectContaining({
      where: { isDisabled: false, enrollments: { some: { isActive: true, status: 'ACTIVE' } } },
      select: expect.objectContaining({ createdFromRegistration: {
        where: { status: 'APPROVED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1,
        select: { grade: true, dateOfBirth: true },
      } }),
    }))
  })
  it('matches case and spacing consistently with the existing manual workflow', async () => {
    accounts.mockResolvedValue([{ ...student, name: '  MINA   mark  ' }])
    expect((await link()).status).toBe('linked')
  })
  it.each([
    { birthDate: null }, { birthDate: new Date('2009-03-03') }, { level: 'GRADE_12' },
    { isActive: false }, { status: 'ARCHIVED' }, { userId: 'someone-else' },
  ])('leaves incomplete or conflicting records for review: %o', async override => {
    children.mockResolvedValue([{ ...child, ...override }])
    expect((await link()).status).toBe('review')
    expect(update).not.toHaveBeenCalled()
    expect(audit).not.toHaveBeenCalled()
  })
  it('blocks duplicate names even if the extra child is archived', async () => {
    children.mockResolvedValue([child, { ...child, id: 'archived', isActive: false, status: 'ARCHIVED' }])
    expect(await link()).toMatchObject({ status: 'review', reason: 'Name is not unique' })
    expect(update).not.toHaveBeenCalled()
  })
  it('blocks duplicate Prep names rather than choosing by matching birthday', async () => {
    accounts.mockResolvedValue([student, { ...student, id: 'other-student', createdFromRegistration: [] }])
    expect(await link()).toMatchObject({ status: 'review', reason: 'Name is not unique' })
    expect(update).not.toHaveBeenCalled()
  })
  it('preserves an existing owner-confirmed link despite conflicting identity evidence or an archived child', async () => {
    children.mockResolvedValue([{ ...child, userId: student.id, firstName: 'Different', birthDate: null, isActive: false, status: 'ARCHIVED' }, { ...child, id: 'new-child' }])
    expect((await link()).status).toBe('already_linked')
    expect(update).not.toHaveBeenCalled()
  })
  it('does not guess aliases', async () => {
    children.mockResolvedValue([{ ...child, firstName: 'Nickname' }])
    expect((await link()).status).toBe('unmatched')
    expect(update).not.toHaveBeenCalled()
  })
  it('does not link an ineligible account or a student outside high school scope', async () => {
    accounts.mockResolvedValue([])
    expect((await link()).status).toBe('not_applicable')
    accounts.mockResolvedValue([{ ...student, createdFromRegistration: [{ grade: 'GRADE_9', dateOfBirth: new Date('2009-03-02') }] }])
    children.mockResolvedValue([{ ...child, level: 'GRADE_9' }])
    expect((await link()).status).toBe('not_applicable')
    expect(update).not.toHaveBeenCalled()
  })
  it('reports missing approved registration evidence without linking', async () => {
    accounts.mockResolvedValue([{ ...student, createdFromRegistration: [] }])
    expect((await link()).status).toBe('review')
    expect(update).not.toHaveBeenCalled()
  })
  it('does not link another eligible student during an unrelated approval', async () => {
    accounts.mockResolvedValue([student, { ...student, id: 'other-student', name: 'Other Person' }])
    children.mockResolvedValue([{ ...child, id: 'other-child', firstName: 'Other', lastName: 'Person' }])
    expect((await link()).status).toBe('unmatched')
    expect(update).not.toHaveBeenCalled()
  })
  it('aborts the approval transaction when roster evidence changes before writing', async () => {
    update.mockResolvedValue({ count: 0 })
    await expect(link()).rejects.toBeInstanceOf(PrepRosterLinkConflictError)
    expect(audit).not.toHaveBeenCalled()
  })
  it('propagates audit failures so approval and linking roll back together', async () => {
    audit.mockRejectedValue(new Error('Audit write failed'))
    await expect(link()).rejects.toThrow('Audit write failed')
  })
})
