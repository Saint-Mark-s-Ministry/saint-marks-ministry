import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), requirement: vi.fn(), update: vi.fn(), clear: vi.fn(), activate: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({
  getAuthorizationContext: mocks.context,
  canWriteBusinessData: (context: { disabled: boolean; readOnly: boolean }) => !context.disabled && !context.readOnly,
}))
vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: mocks.requirement }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: async (callback: (tx: unknown) => unknown) => callback({
    annualMentorInformation: { updateMany: mocks.update },
    studentEnrollment: { updateMany: mocks.activate },
    notification: { deleteMany: mocks.clear },
  }),
} }))
import { POST } from '@/app/api/students/[id]/mentor-information/review/route'

const updatedAt = new Date('2026-10-16T18:00:00Z')
function review(version = updatedAt.toISOString()) {
  return POST(new NextRequest('http://localhost/api/students/student-1/mentor-information/review', {
    method: 'POST', body: JSON.stringify({ updatedAt: version }),
  }), { params: Promise.resolve({ id: 'student-1' }) })
}

describe('annual mentor information review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'admin-1' })
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set(['SERVANTS_PREP_SERVANT']) })
    mocks.requirement.mockResolvedValue({ activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'ACTIVE' }, information: { id: 'info-1', updatedAt, reviewedAt: null } })
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.activate.mockResolvedValue({ count: 1 })
  })

  it('records reviewer and version, then clears only this year mentor reminder', async () => {
    expect((await review()).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'info-1', updatedAt },
      data: { reviewedAt: expect.any(Date), reviewedBy: 'admin-1' },
    })
    expect(mocks.clear).toHaveBeenCalledWith({ where: {
      userId: 'student-1', type: 'REGISTRATION_INCOMPLETE', isPersistent: true,
      metadata: { path: ['academicYearId'], equals: 'year-1' },
    } })
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('reactivates only a withdrawn Year 2 enrollment when its pending form is approved', async () => {
    mocks.requirement.mockResolvedValue({
      activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'WITHDRAWN' },
      information: { id: 'info-1', updatedAt, reviewedAt: null },
    })
    expect(await (await review()).json()).toEqual({ reviewed: true, reactivated: true })
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith({
      where: { id: 'enrollment-1', studentId: 'student-1', status: 'WITHDRAWN', yearLevel: 'YEAR_2' },
      data: { status: 'ACTIVE', isActive: true, graduatedAt: null, graduatedAcademicYearId: null, graduationNote: null },
    })
  })

  it('does not undo a later withdrawal by re-reviewing an already approved form', async () => {
    mocks.requirement.mockResolvedValue({
      activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'WITHDRAWN' },
      information: { id: 'info-1', updatedAt, reviewedAt: new Date() },
    })
    expect(await (await review()).json()).toEqual({ reviewed: true, reactivated: false })
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('does not report reactivation if enrollment changed before approval committed', async () => {
    mocks.requirement.mockResolvedValue({
      activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'WITHDRAWN' },
      information: { id: 'info-1', updatedAt, reviewedAt: null },
    })
    mocks.activate.mockResolvedValue({ count: 0 })
    expect(await (await review()).json()).toEqual({ reviewed: true, reactivated: false })
  })

  it.each([
    { disabled: false, readOnly: true, roleTags: new Set(['PRIEST', 'SUPER_ADMIN']) },
    { disabled: false, readOnly: false, roleTags: new Set(['PRIEST', 'SUPER_ADMIN']) },
    { disabled: false, readOnly: false, roleTags: new Set(['STUDENT']) },
    { disabled: false, readOnly: false, roleTags: new Set(['MENTOR']) },
    { disabled: false, readOnly: false, roleTags: new Set(['SUNDAY_SCHOOL_SERVANT']) },
    { disabled: true, readOnly: false, roleTags: new Set(['SUPER_ADMIN']) },
  ])('denies unauthorized or read-only principals: %o', async (context) => {
    mocks.context.mockResolvedValue(context)
    expect((await review()).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('requires a submission for the active year', async () => {
    mocks.requirement.mockResolvedValue(null)
    expect((await review()).status).toBe(404)
  })

  it('rejects stale details before saving', async () => {
    mocks.requirement.mockResolvedValue({
      activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'WITHDRAWN' },
      information: { id: 'info-1', updatedAt, reviewedAt: null },
    })
    expect((await review('old-version')).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('rejects a concurrent resubmission without clearing its reminder', async () => {
    mocks.requirement.mockResolvedValue({
      activeYear: { id: 'year-1' }, enrollment: { id: 'enrollment-1', status: 'WITHDRAWN' },
      information: { id: 'info-1', updatedAt, reviewedAt: null },
    })
    mocks.update.mockResolvedValue({ count: 0 })
    expect((await review()).status).toBe(409)
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })
})
