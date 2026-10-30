import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getAccess: vi.fn(),
  classFindUnique: vi.fn(),
  classFindMany: vi.fn(),
  memFindUnique: vi.fn(),
  memCreate: vi.fn(),
  memUpdate: vi.fn(),
  childFindMany: vi.fn(),
  scoreUpsert: vi.fn(),
  scoreDeleteMany: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.requireAuth }))
vi.mock('@/lib/authorization', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/authorization')>(),
  getAuthorizationContext: mocks.getAccess,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sundaySchoolClass: { findUnique: mocks.classFindUnique, findMany: mocks.classFindMany },
    sundaySchoolMemorization: { findUnique: mocks.memFindUnique, create: mocks.memCreate, update: mocks.memUpdate, findMany: vi.fn() },
    sundaySchoolChild: { findMany: mocks.childFindMany },
    sundaySchoolMemorizationScore: { upsert: mocks.scoreUpsert, deleteMany: mocks.scoreDeleteMany },
    $transaction: mocks.transaction,
  },
}))

import { GET as listItems, POST as createItem } from '@/app/api/sunday-school/memorizations/route'
import { PATCH as editItem, DELETE as archiveItem } from '@/app/api/sunday-school/memorizations/[id]/route'
import { POST as saveScores } from '@/app/api/sunday-school/memorizations/[id]/scores/route'

const req = (body: unknown) => new Request('http://test', { method: 'POST', body: JSON.stringify(body) })
const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAuth.mockResolvedValue({ id: 'u1', role: 'SERVANT' })
  mocks.getAccess.mockResolvedValue({ disabled: false, readOnly: false, sundaySchoolClassScope: { kind: 'ids', ids: new Set(['c1']) } })
  mocks.classFindUnique.mockResolvedValue({ id: 'c1', sundaySchoolYearId: 'y1' })
  mocks.memFindUnique.mockResolvedValue({ id: 'm1', classId: 'c1', archivedAt: null, class: { sundaySchoolYearId: 'y1' } })
  mocks.transaction.mockResolvedValue([])
})

describe('POST /api/sunday-school/memorizations', () => {
  it('creates an item for a served class', async () => {
    mocks.memCreate.mockResolvedValue({ id: 'm1' })
    const res = await createItem(req({ classId: 'c1', title: 'Psalm 23' }))
    expect(res.status).toBe(201)
    expect(mocks.memCreate.mock.calls[0][0].data).toMatchObject({ classId: 'c1', title: 'Psalm 23', createdById: 'u1' })
  })

  it('forbids users who do not serve the class', async () => {
    mocks.getAccess.mockResolvedValue({ disabled: false, readOnly: false, sundaySchoolClassScope: { kind: 'none' } })
    const res = await createItem(req({ classId: 'c1', title: 'Psalm 23' }))
    expect(res.status).toBe(403)
    expect(mocks.memCreate).not.toHaveBeenCalled()
  })

  it('rejects a missing title', async () => {
    expect((await createItem(req({ classId: 'c1', title: '' }))).status).toBe(400)
  })
})

describe('POST /api/sunday-school/memorizations/[id]/scores', () => {
  it('rejects out-of-range scores', async () => {
    const res = await saveScores(req({ records: [{ childId: 'k1', score: 150 }] }), params('m1'))
    expect(res.status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('forbids non-servants', async () => {
    mocks.getAccess.mockResolvedValue({ disabled: false, readOnly: false, sundaySchoolClassScope: { kind: 'none' } })
    const res = await saveScores(req({ records: [] }), params('m1'))
    expect(res.status).toBe(403)
  })

  it('rejects children outside the class', async () => {
    mocks.childFindMany.mockResolvedValue([])
    const res = await saveScores(req({ records: [{ childId: 'other', score: 80 }] }), params('m1'))
    expect(res.status).toBe(400)
  })

  it('upserts scores and clears null scores', async () => {
    mocks.childFindMany.mockResolvedValue([{ id: 'k1' }, { id: 'k2' }])
    const res = await saveScores(req({ records: [{ childId: 'k1', score: 95, notes: 'Great' }, { childId: 'k2', score: null }] }), params('m1'))
    expect(res.status).toBe(200)
    expect(mocks.scoreUpsert).toHaveBeenCalledTimes(1)
    expect(mocks.scoreDeleteMany).toHaveBeenCalledWith({ where: { memorizationId: 'm1', childId: 'k2' } })
  })

  it('does not score archived items', async () => {
    mocks.memFindUnique.mockResolvedValue({ id: 'm1', classId: 'c1', archivedAt: new Date(), class: { sundaySchoolYearId: 'y1' } })
    expect((await saveScores(req({ records: [] }), params('m1'))).status).toBe(409)
  })
})


describe('current principal authorization', () => {
  it('denies disabled accounts even with an all-class scope', async () => {
    mocks.getAccess.mockResolvedValue({ disabled: true, readOnly: false, sundaySchoolClassScope: { kind: 'all' } })
    expect((await createItem(req({ classId: 'c1', title: 'Prayer' }))).status).toBe(403)
    expect((await listItems(new Request('http://test'))).status).toBe(403)
    expect(mocks.memCreate).not.toHaveBeenCalled()
  })

  it('does not allow an elevated stale session role to grant writes', async () => {
    mocks.requireAuth.mockResolvedValue({ id: 'u1', role: 'SUPER_ADMIN' })
    mocks.getAccess.mockResolvedValue({ disabled: false, readOnly: false, sundaySchoolClassScope: { kind: 'none' } })
    expect((await createItem(req({ classId: 'c1', title: 'Prayer' }))).status).toBe(403)
  })

  it('filters class reads to the resolved scope and refuses other classes', async () => {
    mocks.classFindMany.mockResolvedValue([{ id: 'c1', name: 'Test' }])
    const response = await listItems(new Request('http://test?classId=c2'))
    expect(response.status).toBe(403)
    expect(mocks.classFindMany.mock.calls[0][0].where.id).toEqual({ in: ['c1'] })
  })
})


describe('item editing and archive', () => {
  it('updates the item without allowing its class to change', async () => {
    mocks.memUpdate.mockResolvedValue({ id: 'm1', title: 'Prayer' })
    expect((await editItem(req({ classId: 'other', title: 'Prayer' }), params('m1'))).status).toBe(200)
    expect(mocks.memUpdate.mock.calls[0][0]).toMatchObject({ where: { id: 'm1' }, data: { title: 'Prayer' } })
    expect(mocks.memUpdate.mock.calls[0][0].data).not.toHaveProperty('classId')
    expect(mocks.getAccess).toHaveBeenCalledWith('u1', { sundaySchoolYearId: 'y1' })
  })

  it('archives instead of deleting recorded scores', async () => {
    mocks.memUpdate.mockResolvedValue({ id: 'm1' })
    expect((await archiveItem(req({}), params('m1'))).status).toBe(200)
    expect(mocks.memUpdate).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { archivedAt: expect.any(Date) } })
    expect(mocks.scoreDeleteMany).not.toHaveBeenCalled()
  })

  it('rejects out-of-scope editing and archiving', async () => {
    mocks.getAccess.mockResolvedValue({ disabled: false, readOnly: false, sundaySchoolClassScope: { kind: 'none' } })
    expect((await editItem(req({ title: 'Prayer' }), params('m1'))).status).toBe(403)
    expect((await archiveItem(req({}), params('m1'))).status).toBe(403)
    expect(mocks.memUpdate).not.toHaveBeenCalled()
  })
})
