import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), serve: vi.fn(), findClass: vi.fn(), create: vi.fn(), list: vi.fn(), audit: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/sunday-school-access', () => ({ getSundaySchoolAccess: mocks.access, canServeClass: mocks.serve }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolClass: { findUnique: mocks.findClass }, sundaySchoolRosterLink: { create: mocks.create, findMany: mocks.list },
} }))
import { GET, POST } from '@/app/api/sunday-school/roster-links/route'

const row = { id: 'link', label: null, contactUpdateOnly: true, expiresAt: new Date(Date.now() + 3600_000), revokedAt: null, maxUses: 40, useCount: 0, createdAt: new Date(), createdBy: { id: 'servant', name: 'Servant' }, _count: { children: 0 } }
function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/sunday-school/roster-links', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ id: 'servant', role: 'SERVANT' })
  mocks.access.mockResolvedValue({ servantClassIds: ['class-10'] })
  mocks.serve.mockReturnValue(true)
  mocks.findClass.mockResolvedValue({ id: 'class-10', name: '10th Grade', level: 'GRADE_10', academicYearId: 'academic-year', sundaySchoolYearId: 'ss-year', sundaySchoolYear: { status: 'OPEN' }, status: 'ACTIVE', isActive: true })
  mocks.create.mockResolvedValue(row)
  mocks.list.mockResolvedValue([row])
})

describe('contact QR link management', () => {
  it('re-derives class authority in its academic year and stores a hash and immutable purpose', async () => {
    const response = await POST(request({ classId: 'class-10', contactUpdateOnly: true }))
    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.contactUpdateOnly).toBe(true)
    expect(data.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mocks.access).toHaveBeenCalledWith({ id: 'servant', role: 'SERVANT' }, 'academic-year')
    expect(mocks.serve).toHaveBeenCalledWith(expect.anything(), 'class-10')
    const stored = mocks.create.mock.calls[0][0].data
    expect(stored).toMatchObject({ classId: 'class-10', sundaySchoolYearId: 'ss-year', contactUpdateOnly: true, maxUses: 40, createdById: 'servant' })
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(stored)).not.toContain(data.token)
  })
  it('denies minting and listing for an unassigned caller even with a prep role', async () => {
    mocks.auth.mockResolvedValue({ id: 'prep-leader', role: 'SERVANT_PREP' })
    mocks.serve.mockReturnValue(false)
    expect((await POST(request({ classId: 'class-10', contactUpdateOnly: true }))).status).toBe(403)
    expect((await GET(new NextRequest('http://localhost/api/sunday-school/roster-links?classId=class-10&contactUpdateOnly=true'))).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('lists only contact links for the requested class and never returns tokens or hashes', async () => {
    const response = await GET(new NextRequest('http://localhost/api/sunday-school/roster-links?classId=class-10&contactUpdateOnly=true'))
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ where: { classId: 'class-10', contactUpdateOnly: true } }))
    const body = await response.json()
    expect(body[0]).not.toHaveProperty('token')
    expect(body[0]).not.toHaveProperty('tokenHash')
  })
  it('rejects contact links for closed years and malformed purpose values', async () => {
    mocks.findClass.mockResolvedValue({ id: 'class-10', isActive: true, status: 'ACTIVE', sundaySchoolYearId: 'ss-year', sundaySchoolYear: { status: 'CLOSED' } })
    expect((await POST(request({ classId: 'class-10', contactUpdateOnly: true }))).status).toBe(409)
    expect((await POST(request({ classId: 'class-10', contactUpdateOnly: 'false' }))).status).toBe(400)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
