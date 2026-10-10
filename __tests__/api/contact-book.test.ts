import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag, UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), session: vi.fn(), findUser: vi.fn(), findContacts: vi.fn(),
  count: vi.fn(), transaction: vi.fn(), update: vi.fn(), audit: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: mocks.findUser, findMany: mocks.findContacts, count: mocks.count, update: mocks.update },
  sundaySchoolYear: { findFirst: vi.fn().mockResolvedValue(null) },
  $transaction: mocks.transaction,
} }))
vi.mock('@/lib/user-deletion', () => ({ deleteUserWithRelations: vi.fn(), UserDeletionConflictError: class extends Error {} }))

import { GET } from '@/app/api/contact-book/route'
import { PUT } from '@/app/api/admin/users/[id]/contact-book-access/route'
import { PATCH } from '@/app/api/users/[id]/route'

function principal(overrides: object = {}) {
  return {
    id: 'actor', isDisabled: false, canAccessContactBook: false,
    roleAssignments: [], mentorAssignments: [], guardianOfChildren: [], linkedSundaySchoolChild: null,
    ...overrides,
  }
}
const request = (body: unknown, method = 'PUT') => new Request('https://example.test/api/admin/users/target/contact-book-access', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const params = { params: Promise.resolve({ id: 'target' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.auth.mockResolvedValue({ id: 'actor', role: UserRole.SUPER_ADMIN, canAccessContactBook: true })
  mocks.session.mockResolvedValue({ user: { id: 'actor' } })
  mocks.findUser.mockResolvedValue(principal())
  mocks.findContacts.mockResolvedValue([{ id: 'target', name: 'Mariam', email: 'mariam@example.com', phone: null }])
  mocks.count.mockResolvedValue(1)
  mocks.update.mockResolvedValue({ id: 'target', canAccessContactBook: true })
  mocks.transaction.mockImplementation(async input => Array.isArray(input) ? Promise.all(input) : input({
    user: { findUnique: mocks.findUser, update: mocks.update }, auditEvent: { create: mocks.audit },
  }))
})

describe('contact book reads', () => {
  it('rejects unauthenticated requests before reading contacts', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(401)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })

  it.each(Object.values(UserRole))('does not let %s or a stale JWT bypass the database flag', async role => {
    mocks.auth.mockResolvedValue({ id: 'actor', role, canAccessContactBook: true })
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(403)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })

  it.each(Object.values(UserRole).filter(role => role !== UserRole.SUPER_ADMIN))('allows an explicitly enabled %s without ministry assignments', async role => {
    mocks.auth.mockResolvedValue({ id: 'actor', role })
    mocks.findUser.mockResolvedValue(principal({ canAccessContactBook: true }))
    const response = await GET(new Request('https://example.test/api/contact-book'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    await expect(response.json()).resolves.toEqual({ contacts: [{ id: 'target', name: 'Mariam', email: 'mariam@example.com', phone: null }], total: 1, page: 1, pageSize: 50 })
    expect(mocks.findContacts).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, name: true, email: true, phone: true }, where: {}, take: 50, skip: 0,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    }))
  })

  it.each([false, true])('denies a current super admin with stored directory flag %s', async canAccessContactBook => {
    mocks.findUser.mockResolvedValue(principal({ canAccessContactBook, roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }] }))
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(403)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })

  it('denies a disabled super admin even with a current admin grant', async () => {
    mocks.findUser.mockResolvedValue(principal({ isDisabled: true, roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }] }))
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(403)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })

  it('denies disabled users even with permission', async () => {
    mocks.findUser.mockResolvedValue(principal({ isDisabled: true, canAccessContactBook: true }))
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(403)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })

  it('revokes access on the next request of the same session', async () => {
    mocks.findUser.mockResolvedValueOnce(principal({ canAccessContactBook: true })).mockResolvedValueOnce(principal())
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(200)
    expect((await GET(new Request('https://example.test/api/contact-book'))).status).toBe(403)
    expect(mocks.findContacts).toHaveBeenCalledTimes(1)
  })

  it('searches all contact fields and paginates', async () => {
    mocks.findUser.mockResolvedValue(principal({ canAccessContactBook: true }))
    expect((await GET(new Request('https://example.test/api/contact-book?search=%20Mariam%20&page=2'))).status).toBe(200)
    expect(mocks.findContacts).toHaveBeenCalledWith(expect.objectContaining({ skip: 50, take: 50, where: {
      OR: ['name', 'email', 'phone'].map(field => ({ [field]: { contains: 'Mariam', mode: 'insensitive' } })),
    } }))
  })

  it.each(['0', '-1', '1.5', 'abc', '9007199254740991'])('rejects invalid page %s', async page => {
    mocks.findUser.mockResolvedValue(principal({ canAccessContactBook: true }))
    expect((await GET(new Request(`https://example.test/api/contact-book?page=${page}`))).status).toBe(400)
    expect(mocks.findContacts).not.toHaveBeenCalled()
  })
})

describe('contact book permission updates', () => {
  function admin(overrides: object = {}) {
    mocks.findUser.mockResolvedValueOnce(principal({ roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }], ...overrides }))
  }

  it('rejects stale super-admin claims and non-admins', async () => {
    expect((await PUT(request({ canAccessContactBook: true }), params)).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects a disabled administrator', async () => {
    admin({ isDisabled: true })
    expect((await PUT(request({ canAccessContactBook: true }), params)).status).toBe(403)
  })

  it('keeps priests read-only even with an admin tag', async () => {
    admin({ roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }, { tag: RoleTag.PRIEST }] })
    expect((await PUT(request({ canAccessContactBook: true }), params)).status).toBe(403)
  })

  it('rejects View as without relying on the proxy', async () => {
    mocks.session.mockResolvedValue({ impersonating: { originalId: 'real-admin' } })
    expect((await PUT(request({ canAccessContactBook: true }), params)).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([{}, null, [], { canAccessContactBook: 'true' }, { canAccessContactBook: 1 }])('rejects invalid body %j', async body => {
    admin()
    expect((await PUT(request(body), params)).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('returns 404 for a missing target', async () => {
    admin()
    mocks.findUser.mockResolvedValueOnce(null)
    expect((await PUT(request({ canAccessContactBook: true }), params)).status).toBe(404)
  })

  it.each([true, false])('saves %s and audits the actor, target, and change', async enabled => {
    admin()
    mocks.findUser.mockResolvedValueOnce({ canAccessContactBook: !enabled })
    mocks.update.mockResolvedValue({ id: 'target', canAccessContactBook: enabled })
    const response = await PUT(request({ canAccessContactBook: enabled }), params)
    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'target' }, data: { canAccessContactBook: enabled }, select: { id: true, canAccessContactBook: true } })
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({
      actorUserId: 'actor', entityId: 'target', action: enabled ? 'CONTACT_BOOK_ACCESS_GRANTED' : 'CONTACT_BOOK_ACCESS_REVOKED',
      metadata: { previous: !enabled, canAccessContactBook: enabled },
    }) })
  })

  it('allows a super admin to opt themselves in without existing directory access', async () => {
    admin()
    mocks.findUser.mockResolvedValueOnce({ canAccessContactBook: false })
    expect((await PUT(request({ canAccessContactBook: true }), { params: Promise.resolve({ id: 'actor' }) })).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'actor' } }))
  })

  it('rejects self-service and ordinary profile permission injection', async () => {
    expect((await PATCH(request({ canAccessContactBook: true }, 'PATCH'), params)).status).toBe(403)
    expect(mocks.findUser).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
