import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(), claim: vi.fn(), findChildren: vi.fn(), updateChildren: vi.fn(),
  transaction: vi.fn(), rate: vi.fn(), audit: vi.fn(), create: vi.fn(), enroll: vi.fn(), matchFamilies: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolRosterLink: { findUnique: mocks.findLink }, $transaction: mocks.transaction,
} }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: mocks.rate }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))
vi.mock('@/lib/sunday-school-enrollment', () => ({ enrollChildInClass: mocks.enroll }))
vi.mock('@/lib/sunday-school-family-matching', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sunday-school-family-matching')>(),
  matchSundaySchoolFamilies: mocks.matchFamilies,
}))
import { GET, POST } from '@/app/api/public/roster-signup/route'

const token = 'Ab3-_cdefghijklmnopqrstuvwxyz0123456789XYZ'
const link = {
  id: 'contact-link', classId: 'grade-10-a', sundaySchoolYearId: 'year', contactUpdateOnly: true,
  sundaySchoolYear: { status: 'OPEN' }, label: null, expiresAt: new Date(Date.now() + 3600_000),
  revokedAt: null, useCount: 0, maxUses: 40,
  class: { id: 'grade-10-a', name: '10th Grade A', level: 'GRADE_10', isActive: true, status: 'ACTIVE' },
}
const valid = { token, firstName: 'Mina', lastName: 'Botros', birthDate: '2011-04-12', cellPhone: '201-555-0123', guardianPhone: '201-555-0199' }
function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/public/roster-signup', {
    method: 'POST', body: JSON.stringify({ ...valid, ...overrides }),
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' },
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.findLink.mockResolvedValue(link)
  mocks.claim.mockResolvedValue({ count: 1 })
  mocks.findChildren.mockResolvedValue([{ id: 'child-in-class' }])
  mocks.updateChildren.mockResolvedValue({ count: 1 })
  mocks.rate.mockResolvedValue({ allowed: true })
  mocks.transaction.mockImplementation(callback => callback({
    sundaySchoolRosterLink: { updateMany: mocks.claim },
    sundaySchoolChild: { findMany: mocks.findChildren, updateMany: mocks.updateChildren, create: mocks.create },
  }))
})

describe('class contact-update QR', () => {
  it('uses the stored purpose and class despite tampered client IDs and mode', async () => {
    const response = await POST(request({ classId: 'grade-11', childId: 'other-child', level: 'GRADE_11', contactUpdateOnly: false, guardianName: 'Changed', notes: 'Changed', status: 'ARCHIVED', birthDate: valid.birthDate }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    const query = mocks.findChildren.mock.calls[0][0]
    expect(query).toEqual({ where: expect.objectContaining({
      classId: 'grade-10-a', isActive: true, status: 'ACTIVE',
      firstName: { equals: 'Mina', mode: 'insensitive' }, lastName: { equals: 'Botros', mode: 'insensitive' },
      birthDate: new Date('2011-04-12T00:00:00.000Z'),
    }), take: 2, select: { id: true } })
    for (const [args] of mocks.updateChildren.mock.calls) {
      expect(args.where).toMatchObject({ id: 'child-in-class', classId: 'grade-10-a', isActive: true, status: 'ACTIVE' })
      expect(Object.keys(args.data)).toHaveLength(1)
      expect(['cellPhone', 'guardianPhone']).toContain(Object.keys(args.data)[0])
    }
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.enroll).not.toHaveBeenCalled()
    expect(mocks.matchFamilies).not.toHaveBeenCalled()
  })

  it('guards blank fields in each write, so a concurrent servant edit cannot be overwritten', async () => {
    mocks.updateChildren.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 })
    await POST(request())
    expect(mocks.updateChildren).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({ OR: [{ cellPhone: null }, { cellPhone: '' }] }), data: { cellPhone: valid.cellPhone },
    })
    expect(mocks.updateChildren).toHaveBeenNthCalledWith(2, {
      where: expect.objectContaining({ OR: [{ guardianPhone: null }, { guardianPhone: '' }] }), data: { guardianPhone: valid.guardianPhone },
    })
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: {
      rosterLinkId: link.id, classId: link.classId, fields: ['guardianPhone'],
    } }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(valid.guardianPhone)
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(valid.birthDate)
  })

  it.each([{ matches: [] }, { matches: [{ id: 'duplicate-1' }, { id: 'duplicate-2' }] }])('never picks an uncertain identity or creates a child', async ({ matches }) => {
    mocks.findChildren.mockResolvedValue(matches)
    const response = await POST(request())
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.updateChildren).not.toHaveBeenCalled()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('returns the same acknowledgement when existing phone numbers are already filled', async () => {
    mocks.updateChildren.mockResolvedValue({ count: 0 })
    expect(await (await POST(request())).json()).toEqual({ success: true })
    expect(mocks.audit).not.toHaveBeenCalled()
  })

  it.each([
    { firstName: '' }, { lastName: '' }, { birthDate: '' }, { birthDate: '2011-02-30' },
    { birthDate: '2099-01-01' }, { birthDate: '04/12/2011' }, { cellPhone: '', guardianPhone: '' },
    { cellPhone: '123' }, { guardianPhone: '2015550199 or 2015550188' }, { firstName: 'x'.repeat(101) },
  ])('rejects invalid identity or phone inputs before writing: %j', async invalid => {
    expect((await POST(request(invalid))).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([
    { revokedAt: new Date() }, { expiresAt: new Date(0) }, { useCount: 40 },
    { sundaySchoolYear: { status: 'CLOSED' } }, { class: { ...link.class, isActive: false } },
  ])('refuses unusable links: %j', async overrides => {
    mocks.findLink.mockResolvedValue({ ...link, ...overrides })
    expect((await POST(request())).status).toBe(410)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('rechecks expiry, cap, revocation, stored purpose and open year atomically', async () => {
    mocks.claim.mockResolvedValue({ count: 0 })
    expect((await POST(request())).status).toBe(410)
    expect(mocks.claim).toHaveBeenCalledWith({ where: {
      id: link.id, classId: link.classId, contactUpdateOnly: true,
      revokedAt: null, expiresAt: { gt: expect.any(Date) }, useCount: { lt: 40 },
      class: { isActive: true, status: 'ACTIVE' }, sundaySchoolYear: { status: 'OPEN' },
    }, data: { useCount: { increment: 1 } } })
    expect(mocks.findChildren).not.toHaveBeenCalled()
  })

  it('rate limits repeated name attempts even when the birth date changes, without raw PII in keys', async () => {
    await POST(request())
    const originalKey = mocks.rate.mock.calls[0][0]
    await POST(request({ birthDate: '2011-04-13' }))
    expect(mocks.rate.mock.calls[2][0]).toBe(originalKey)
    expect(mocks.rate).toHaveBeenCalledWith(originalKey, 5, 900_000)
    const keys = mocks.rate.mock.calls.map(call => call[0]).join(' ')
    expect(keys).not.toContain('Mina')
    expect(keys).not.toContain('Botros')
    expect(keys).not.toContain('192.0.2.1')
    mocks.rate.mockResolvedValue({ allowed: false, retryAfterSeconds: 123 })
    mocks.transaction.mockClear()
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('123')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('GET exposes purpose and class metadata, never a searchable roster or contacts', async () => {
    const response = await GET(new NextRequest(`http://localhost/api/public/roster-signup?token=${token}&classId=grade-11`))
    expect(await response.json()).toEqual({
      className: '10th Grade A', levelLabel: '10th Grade', label: null,
      contactUpdateOnly: true, expiresAt: link.expiresAt.toISOString(), remainingUses: 40,
    })
    expect(mocks.findChildren).not.toHaveBeenCalled()
  })
})
