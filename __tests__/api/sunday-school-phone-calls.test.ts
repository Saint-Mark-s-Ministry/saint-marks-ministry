import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolPhoneCallOutcome } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  access: vi.fn(),
  canServeClass: vi.fn(),
  canViewClass: vi.fn(),
  visibleClassFilter: vi.fn(),
  authorization: vi.fn(),
  findChild: vi.fn(),
  findClasses: vi.fn(),
  createCall: vi.fn(),
  createAudit: vi.fn(),
  createVisitation: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.authorization }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.access,
  canServeClass: mocks.canServeClass,
  canViewClass: mocks.canViewClass,
  visibleClassFilter: mocks.visibleClassFilter,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolChild: { findUnique: mocks.findChild },
    sundaySchoolClass: { findMany: mocks.findClasses },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/notifications', () => ({ notifyPriestNoteCreated: vi.fn() }))

import { POST } from '@/app/api/sunday-school/phone-calls/route'
import { GET } from '@/app/api/sunday-school/visitations/route'

const callDetails = {
  childId: 'child-1',
  calledAt: '2026-10-08',
  outcome: SundaySchoolPhoneCallOutcome.CONNECTED,
  note: 'Spoke with the guardian about the absence.',
}

function postCall(body: unknown) {
  return POST(new Request('http://localhost/api/sunday-school/phone-calls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('Sunday School phone calls', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'servant-1', name: 'Servant One', role: 'SERVANT' })
    mocks.access.mockResolvedValue({ canRead: true, readOnly: false })
    mocks.canServeClass.mockReturnValue(true)
    mocks.canViewClass.mockReturnValue(true)
    mocks.visibleClassFilter.mockReturnValue(['class-1'])
    mocks.authorization.mockResolvedValue({ roleTags: new Set() })
    mocks.findChild.mockResolvedValue({
      id: 'child-1',
      isActive: true,
      classId: 'class-1',
      class: { isActive: true, academicYearId: 'year-1', academicYear: { isActive: true } },
    })
    mocks.createCall.mockResolvedValue({ id: 'call-1', ...callDetails, callerName: 'Servant One' })
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolPhoneCall: { create: mocks.createCall },
      sundaySchoolVisitation: { create: mocks.createVisitation },
      auditEvent: { create: mocks.createAudit },
    }))
    mocks.findClasses.mockResolvedValue([])
  })

  it('records the authenticated caller without creating a visitation', async () => {
    const response = await postCall(callDetails)

    expect(response.status).toBe(201)
    expect(mocks.access).toHaveBeenCalledWith(expect.objectContaining({ id: 'servant-1' }), 'year-1')
    expect(mocks.canServeClass).toHaveBeenCalledWith(expect.anything(), 'class-1')
    expect(mocks.createCall).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        classId: 'class-1',
        childId: 'child-1',
        callerId: 'servant-1',
        callerName: 'Servant One',
        outcome: SundaySchoolPhoneCallOutcome.CONNECTED,
        note: callDetails.note,
      }),
    }))
    expect(mocks.createVisitation).not.toHaveBeenCalled()
    expect(mocks.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ entityId: 'call-1' }),
    }))
  })

  it('denies a priest', async () => {
    mocks.auth.mockResolvedValue({ id: 'priest-1', name: 'Priest One', role: 'PRIEST' })
    mocks.access.mockResolvedValue({ canRead: true, readOnly: true })
    mocks.canServeClass.mockReturnValue(false)

    const response = await postCall(callDetails)

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('denies an unassigned servant', async () => {
    mocks.canServeClass.mockReturnValue(false)

    const response = await postCall(callDetails)

    expect(response.status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([
    { ...callDetails, calledAt: '2026-02-30' },
    { ...callDetails, calledAt: '9999-12-31' },
    { ...callDetails, outcome: 'VISITED' },
    { ...callDetails, note: '   ' },
    { ...callDetails, note: 'x'.repeat(501) },
  ])('rejects invalid %s before writing', async body => {
    const response = await postCall(body)

    expect(response.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('limits both call and visit history to visible classes', async () => {
    const response = await GET(new Request('http://localhost/api/sunday-school/visitations'))

    expect(response.status).toBe(200)
    expect(mocks.findClasses).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        children: expect.objectContaining({
          select: expect.objectContaining({
            phoneCalls: expect.objectContaining({ where: { classId: { in: ['class-1'] } } }),
            visitations: expect.objectContaining({ where: { classId: { in: ['class-1'] } } }),
          }),
        }),
      }),
    }))
  })
})
