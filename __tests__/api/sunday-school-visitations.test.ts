import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  context: vi.fn(),
  principal: vi.fn(),
  updateChildren: vi.fn(),
  findChild: vi.fn(),
  createVisitation: vi.fn(),
  createPriestNote: vi.fn(),
  createAudit: vi.fn(),
  transaction: vi.fn(),
  getSundaySchoolAccess: vi.fn(),
  canServeClass: vi.fn(),
  notifyPriestNoteCreated: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: mocks.getSundaySchoolAccess,
  canServeClass: mocks.canServeClass,
  canViewClass: vi.fn(),
  visibleClassFilter: vi.fn(),
}))
vi.mock('@/lib/notifications', () => ({
  notifyPriestNoteCreated: mocks.notifyPriestNoteCreated,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.principal },
    sundaySchoolChild: { findUnique: mocks.findChild, updateMany: mocks.updateChildren },
    $transaction: mocks.transaction,
  },
}))

import { PATCH, POST } from '@/app/api/sunday-school/visitations/route'

describe('Sunday School visitations API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.findChild.mockResolvedValue({
      id: 'child-1',
      classId: 'class-1',
      class: { academicYearId: 'year-1' },
    })
    mocks.getSundaySchoolAccess.mockResolvedValue({ servantClassIds: new Set(['class-1']) })
    mocks.canServeClass.mockReturnValue(true)
    mocks.createVisitation.mockResolvedValue({
      id: 'visitation-1',
      status: 'DONE',
      visitedAt: new Date('2026-09-20T00:00:00Z'),
      notes: 'Shared follow-up',
      createdAt: new Date('2026-09-20T12:00:00Z'),
      updatedAt: new Date('2026-09-20T12:00:00Z'),
      recorder: { id: 'servant-1', name: 'Servant One' },
    })
    mocks.createPriestNote.mockResolvedValue({ id: 'priest-note-1' })
    mocks.createAudit.mockResolvedValue({ id: 'audit-1' })
    mocks.notifyPriestNoteCreated.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(async callback => callback({
      sundaySchoolVisitation: { create: mocks.createVisitation },
      sundaySchoolPriestNote: { create: mocks.createPriestNote },
      auditEvent: { create: mocks.createAudit },
    }))
  })

  it('atomically attaches an optional private note to the new visitation', async () => {
    const response = await POST(new Request('http://localhost/api/sunday-school/visitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childId: 'child-1',
        status: 'DONE',
        visitedAt: '2026-09-20',
        notes: 'Shared follow-up',
        privateNote: '  Confidential follow-up  ',
      }),
    }))

    expect(response.status).toBe(201)
    expect(mocks.createPriestNote).toHaveBeenCalledWith({
      data: {
        visitationId: 'visitation-1',
        authorId: 'servant-1',
        content: 'Confidential follow-up',
      },
      select: { id: true },
    })
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'priest-note-1',
        metadata: { visitationId: 'visitation-1', childId: 'child-1' },
      }),
    })
    expect(JSON.stringify(mocks.createAudit.mock.calls)).not.toContain('Confidential follow-up')
    expect(mocks.notifyPriestNoteCreated).toHaveBeenCalledWith({
      noteId: 'priest-note-1',
      visitationId: 'visitation-1',
      childId: 'child-1',
      submittedById: 'servant-1',
    })
  })

  it('saves a visitation without creating a private note when the field is blank', async () => {
    const response = await POST(new Request('http://localhost/api/sunday-school/visitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childId: 'child-1',
        status: 'NOT_DONE',
        privateNote: '   ',
      }),
    }))

    expect(response.status).toBe(201)
    expect(mocks.createPriestNote).not.toHaveBeenCalled()
    expect(mocks.createAudit).not.toHaveBeenCalled()
    expect(mocks.notifyPriestNoteCreated).not.toHaveBeenCalled()
  })

  it('rejects an oversized private note before writing the visitation', async () => {
    const response = await POST(new Request('http://localhost/api/sunday-school/visitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        childId: 'child-1',
        status: 'DONE',
        privateNote: 'x'.repeat(5001),
      }),
    }))

    expect(response.status).toBe(400)
    expect(mocks.findChild).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})


describe('shared priority visits', () => {
  const request = (body: unknown) => new Request('http://localhost/api/sunday-school/visitations', {
    method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAuth.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false })
    mocks.principal.mockResolvedValue({ id: 'servant-1', role: 'SERVANT' })
    mocks.getSundaySchoolAccess.mockResolvedValue({})
    mocks.canServeClass.mockReturnValue(true)
    mocks.findChild.mockResolvedValue({ id: 'child-1', classId: 'class-1', isActive: true })
    mocks.updateChildren.mockResolvedValue({ count: 1 })
  })
  it('sets and clears priority without creating visit or phone call history', async () => {
    for (const priority of [true, false]) {
      const res = await PATCH(request({ childId: 'child-1', priority }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ id: 'child-1', visitationPriority: priority })
      expect(mocks.updateChildren).toHaveBeenLastCalledWith({
        where: { id: 'child-1', classId: 'class-1', isActive: true, class: { isActive: true, academicYear: { isActive: true } } },
        data: { visitationPriority: priority },
      })
    }
    expect(mocks.createVisitation).not.toHaveBeenCalled()
  })
  it('denies priests and disabled accounts before reading the child', async () => {
    for (const context of [{ readOnly: true }, { disabled: true }]) {
      mocks.context.mockResolvedValue(context)
      expect((await PATCH(request({ childId: 'child-1', priority: true }))).status).toBe(403)
    }
    expect(mocks.findChild).not.toHaveBeenCalled()
  })
  it('denies unassigned users and inactive or unassigned children', async () => {
    mocks.canServeClass.mockReturnValue(false)
    expect((await PATCH(request({ childId: 'child-1', priority: true }))).status).toBe(403)
    mocks.canServeClass.mockReturnValue(true)
    for (const child of [{ id: 'child-1', classId: null, isActive: true }, { id: 'child-1', classId: 'class-1', isActive: false }]) {
      mocks.findChild.mockResolvedValue(child)
      expect((await PATCH(request({ childId: 'child-1', priority: true }))).status).toBe(403)
    }
    expect(mocks.updateChildren).not.toHaveBeenCalled()
  })
  it('validates booleans and reports concurrent roster changes', async () => {
    expect((await PATCH(request({ childId: 'child-1', priority: 'true' }))).status).toBe(400)
    expect((await PATCH(request(null))).status).toBe(400)
    mocks.updateChildren.mockResolvedValue({ count: 0 })
    expect((await PATCH(request({ childId: 'child-1', priority: true }))).status).toBe(409)
  })
})
