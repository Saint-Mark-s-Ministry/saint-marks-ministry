// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), find: vi.fn(), update: vi.fn(), create: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', async (original) => ({ ...await original<typeof import('@/lib/sunday-school-access')>(), getSundaySchoolAccess: mocks.access }))
vi.mock('@/lib/sunday-school-family-matching', () => ({ lockFamilyMatching: vi.fn(), matchSundaySchoolFamilies: vi.fn() }))
vi.mock('@/lib/sunday-school-family', () => ({ normalizeSundaySchoolFamilyDetails: () => null, hasSundaySchoolFamilyDetails: () => false, sundaySchoolFamilyInclude: {}, suppliedSundaySchoolFamilyDetails: () => ({}), withSundaySchoolFamilyDetails: (child: unknown) => child, familyDetailOverrides: () => ({}) }))
vi.mock('@/lib/sunday-school-child-account', () => ({ sundaySchoolChildAccountSelect: {}, withServantsPrepStudentStatus: (child: unknown) => child }))
vi.mock('@/lib/prisma', () => {
  const tx = { sundaySchoolChild: { findMany: mocks.list, findUnique: mocks.find, findUniqueOrThrow: mocks.find, update: mocks.update, create: mocks.create } }
  return { prisma: { ...tx, $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } }
})
import { PATCH } from '@/app/api/sunday-school/children/[id]/route'
import { GET, POST } from '@/app/api/sunday-school/children/route'
const params = { params: Promise.resolve({ id: 'child-synthetic' }) }
const request = (fields: unknown, method = 'PATCH') => new Request('http://localhost/api/sunday-school/children/child-synthetic', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'servant-synthetic', role: 'SERVANT' })
  mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: false, servantClassIds: new Set(['class-synthetic']), coordinatorClassIds: new Set(), visibleClassIds: new Set(['class-synthetic']) })
  mocks.find.mockResolvedValue({ id: 'child-synthetic', classId: 'class-synthetic', familyId: null, level: 'GRADE_1', enrollments: [], familyDetailsOverrides: null })
  mocks.update.mockResolvedValue({ id: 'child-synthetic' })
  mocks.create.mockResolvedValue({ id: 'child-synthetic' })
})

describe('child other-church updates', () => {
  it('saves a normalized marker through existing class write authorization', async () => {
    const response = await PATCH(request({ attendsOtherChurch: true, otherChurchName: ' Synthetic Church ' }), params)
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { attendsOtherChurch: true, otherChurchName: 'Synthetic Church' } }))
  })
  it('clears the stored name when unmarked', async () => {
    expect((await PATCH(request({ attendsOtherChurch: false }), params)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { attendsOtherChurch: false, otherChurchName: null } }))
  })
  it('preserves church data on unrelated updates', async () => {
    expect((await PATCH(request({ notes: 'Synthetic note' }), params)).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { notes: 'Synthetic note' } }))
  })
  it('rejects oversized names and malformed markers without writing', async () => {
    for (const fields of [{ otherChurchName: 'a'.repeat(201) }, { attendsOtherChurch: 'true' }]) {
      expect((await PATCH(request(fields), params)).status).toBe(400)
    }
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('denies another class and read-only viewers', async () => {
    for (const servedClassIds of [[], ['other-class']]) {
      mocks.access.mockResolvedValue({ canRead: true, isAdmin: false, readOnly: false, servantClassIds: new Set(servedClassIds), coordinatorClassIds: new Set(), visibleClassIds: new Set(['class-synthetic']) })
      expect((await PATCH(request({ attendsOtherChurch: true }), params)).status).toBe(403)
    }
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('denies a read-only context even when assigned to the class', async () => {
    const access = await mocks.access()
    mocks.access.mockResolvedValue({ ...access, readOnly: true })
    expect((await PATCH(request({ attendsOtherChurch: true }), params)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('keeps church details inside the existing class-scoped roster query', async () => {
    mocks.list.mockResolvedValue([{ id: 'child-synthetic', attendsOtherChurch: true, otherChurchName: 'Synthetic Church' }])
    const response = await GET(new Request('http://localhost/api/sunday-school/children'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: 'child-synthetic', attendsOtherChurch: true, otherChurchName: 'Synthetic Church' }])
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: { in: ['class-synthetic'] } } }))
    mocks.list.mockClear()
    expect((await GET(new Request('http://localhost/api/sunday-school/children?classId=other-class'))).status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated writes', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await PATCH(request({ attendsOtherChurch: true }), params)).status).toBe(401)
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('supports church information when creating a child as an admin', async () => {
    mocks.access.mockResolvedValue({ canRead: true, isAdmin: true })
    expect((await POST(request({ firstName: 'Synthetic', lastName: 'Child', level: 'GRADE_1', attendsOtherChurch: true, otherChurchName: ' Synthetic Church ' }, 'POST'))).status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attendsOtherChurch: true, otherChurchName: 'Synthetic Church' }) }))
  })
})
