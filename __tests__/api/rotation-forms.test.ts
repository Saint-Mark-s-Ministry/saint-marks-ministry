import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), context: vi.fn(), put: vi.fn(), del: vi.fn(),
  assignment: vi.fn(), enrollment: vi.fn(), forms: vi.fn(),
  create: vi.fn(), updateMany: vi.fn(), formById: vi.fn(), transaction: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/authorization')>(), getAuthorizationContext: mocks.context }))
vi.mock('@vercel/blob', () => ({ put: mocks.put, del: mocks.del }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolAssignment: { findFirst: mocks.assignment },
  studentEnrollment: { findUnique: mocks.enrollment },
  sundaySchoolRotationForm: { findMany: mocks.forms },
  $transaction: mocks.transaction,
} }))
import { GET, POST } from '@/app/api/sunday-school/rotation-forms/route'
import { POST as REVIEW } from '@/app/api/sunday-school/rotation-forms/[id]/review/route'

function request({ completedWeeks = '4', type = 'application/pdf', size = 5 } = {}) {
  const data = new FormData()
  data.set('assignmentId', 'rotation-1')
  data.set('completedWeeks', completedWeeks)
  data.set('file', new File(['x'.repeat(size)], 'form.pdf', { type }))
  return { formData: async () => data } as Request
}
const current = { id: 'rotation-1', studentId: 'student-1', totalWeeks: 4, isActive: true, startDate: new Date('2026-09-06'), rotationForm: null, class: { level: 'KINDERGARTEN' } }
const reviewParams = { params: Promise.resolve({ id: 'form-1' }) }
function reviewRequest(body: unknown) {
  return new Request('http://localhost/api/sunday-school/rotation-forms/form-1/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

describe('rotation form upload and review boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'student-1', role: 'SUPER_ADMIN' }) // Claims never grant review authority.
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SERVANTS_PREP_STUDENT]), prepStudentScope: { kind: 'ids', ids: new Set(['student-1']) } })
    mocks.assignment.mockResolvedValue(current)
    mocks.enrollment.mockResolvedValue({ isActive: true, isAsyncStudent: true, status: 'ACTIVE' })
    mocks.put.mockResolvedValue({ url: 'https://example.com/signed-form.pdf' })
    mocks.del.mockResolvedValue(undefined)
    mocks.forms.mockResolvedValue([])
    mocks.create.mockResolvedValue({ id: 'form-1', status: 'PENDING' })
    mocks.updateMany.mockResolvedValue({ count: 1 })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolAssignment: { findFirst: mocks.assignment },
      sundaySchoolRotationForm: { create: mocks.create, updateMany: mocks.updateMany, findUniqueOrThrow: mocks.formById },
    }))
  })
  afterEach(() => vi.useRealTimers())

  it('stores evidence pending review without creating attendance or advancing a rotation', async () => {
    const response = await POST(request())
    expect(response.status).toBe(201)
    expect((await response.json()).status).toBe('PENDING')
    expect(mocks.create).toHaveBeenCalledWith({ data: { assignmentId: 'rotation-1', level: 'KINDERGARTEN', fileUrl: 'https://example.com/signed-form.pdf', filename: 'form.pdf' } })
    expect(mocks.assignment).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rotation-1', studentId: 'student-1', isActive: true } }))
  })

  it.each([
    { completedWeeks: '3' }, { type: 'text/html' }, { size: 0 },
  ])('rejects incomplete attestations and unsupported files: %j', async options => {
    expect((await POST(request(options))).status).toBe(400)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('does not accept a form before the fourth week', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T12:00:00Z'))
    expect((await POST(request())).status).toBe(400)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('denies another student’s rotation and an inactive enrollment', async () => {
    mocks.assignment.mockResolvedValueOnce(null)
    expect((await POST(request())).status).toBe(403)
    mocks.enrollment.mockResolvedValue({ isActive: false, isAsyncStudent: true })
    expect((await POST(request())).status).toBe(403)
    expect(mocks.put).not.toHaveBeenCalled()
  })

  it('scopes form reads to the current database student scope', async () => {
    await GET(new Request('http://localhost/api/sunday-school/rotation-forms?studentId=other-student'))
    expect(mocks.forms).toHaveBeenCalledWith(expect.objectContaining({ where: { assignment: { studentId: 'student-1' } } }))
  })

  it('cleans up an uploaded blob if the rotation changes before persistence', async () => {
    mocks.assignment.mockResolvedValueOnce(current).mockResolvedValueOnce(null)
    expect((await POST(request())).status).toBe(409)
    expect(mocks.del).toHaveBeenCalledWith('https://example.com/signed-form.pdf', expect.anything())
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('does not let a student approve their own form despite a stale admin claim', async () => {
    expect((await REVIEW(reviewRequest({ status: 'APPROVED', confirmedWeeks: 4, version: 1 }), reviewParams)).status).toBe(403)
  })

  it('requires four signed weeks and a review version before manager approval', async () => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]) })
    expect((await REVIEW(reviewRequest({ status: 'APPROVED', confirmedWeeks: 3, version: 1 }), reviewParams)).status).toBe(400)
    expect((await REVIEW(reviewRequest({ status: 'APPROVED', confirmedWeeks: 4 }), reviewParams)).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('keeps a rejected form on the same rotation and requires correction notes', async () => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]) })
    expect((await REVIEW(reviewRequest({ status: 'REJECTED', version: 1 }), reviewParams)).status).toBe(400)
    expect((await REVIEW(reviewRequest({ status: 'REJECTED', version: 1, notes: 'Fourth week is not signed' }), reviewParams)).status).toBe(200)
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'form-1', status: 'PENDING', version: 1, assignment: { isActive: true, studentId: { not: 'student-1' } } }, data: expect.objectContaining({ status: 'REJECTED' }) }))
  })

  it.each([{ disabled: true, readOnly: false }, { disabled: false, readOnly: true }])('denies disabled or read-only managers', async flags => {
    mocks.context.mockResolvedValue({ ...flags, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    expect((await REVIEW(reviewRequest({ status: 'APPROVED', confirmedWeeks: 4, version: 1 }), reviewParams)).status).toBe(403)
  })
})
