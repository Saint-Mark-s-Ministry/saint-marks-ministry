import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), principal: vi.fn(), context: vi.fn(), access: vi.fn(), classroom: vi.fn(), children: vi.fn(), sessions: vi.fn(), lessons: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-access', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/sunday-school-access')>(), getSundaySchoolAccess: mocks.access }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.principal },
  sundaySchoolClass: { findFirst: mocks.classroom },
  sundaySchoolChild: { findMany: mocks.children },
  sundaySchoolSession: { findMany: mocks.sessions },
  sundaySchoolWeeklyLesson: { findMany: mocks.lessons },
} }))
import { GET } from '@/app/api/sunday-school/attendance/history/route'
const request = (query = '?classId=class-1') => new Request(`http://localhost/api/sunday-school/attendance/history${query}`)
describe('individual attendance API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'servant', role: 'SUPER_ADMIN' })
    mocks.principal.mockResolvedValue({ id: 'servant', role: 'SERVANT' })
    mocks.context.mockResolvedValue({ disabled: false })
    mocks.access.mockResolvedValue({ canRead: true, visibleClassIds: new Set(['class-1']) })
    mocks.classroom.mockResolvedValue({ id: 'class-1', name: 'Class One' })
    mocks.children.mockResolvedValue([{ id: 'child', firstName: 'Mary', lastName: 'Hanna' }])
    mocks.sessions.mockResolvedValue([])
    mocks.lessons.mockResolvedValue([{ sundayDate: new Date('2026-10-04') }])
  })
  it('requires authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await GET(request())).status).toBe(401)
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('requires an explicit class', async () => { expect((await GET(request(''))).status).toBe(400) })
  it('denies another class, an unassigned prep participant, and a disabled principal', async () => {
    expect((await GET(request('?classId=other'))).status).toBe(403)
    expect(mocks.access).toHaveBeenCalledWith({ id: 'servant', role: 'SERVANT' })
    mocks.access.mockResolvedValue({ canRead: false, visibleClassIds: new Set() })
    expect((await GET(request())).status).toBe(403)
    mocks.access.mockResolvedValue({ canRead: true, visibleClassIds: 'all' })
    mocks.context.mockResolvedValue({ disabled: true })
    expect((await GET(request())).status).toBe(403)
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
  it('allows a priest to read without writing and scopes every history query to one class', async () => {
    mocks.access.mockResolvedValue({ canRead: true, readOnly: true, visibleClassIds: 'all' })
    const res = await GET(request())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ dates: ['2026-10-04'], children: [{ rate: null }] })
    expect(mocks.sessions).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: 'class-1', date: { lte: expect.any(Date) } } }))
    expect(mocks.children).toHaveBeenCalledWith({ where: { classId: 'class-1', isActive: true }, select: { id: true, firstName: true, lastName: true } })
    expect(mocks.lessons).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: 'class-1', sundayDate: { lte: expect.any(Date) } } }))
  })
  it('does not read inactive classes or prior academic-year classes', async () => {
    mocks.classroom.mockResolvedValue(null)
    expect((await GET(request())).status).toBe(404)
    expect(mocks.classroom).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'class-1', isActive: true, academicYear: { isActive: true } } }))
    expect(mocks.sessions).not.toHaveBeenCalled()
  })
})
