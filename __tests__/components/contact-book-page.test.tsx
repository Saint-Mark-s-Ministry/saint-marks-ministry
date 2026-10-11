import { RoleTag } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), context: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/authorization', async original => ({ ...await original<typeof import('@/lib/authorization')>(), getAuthorizationContext: mocks.context }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`) } }))
vi.mock('@/components/contact-book', () => ({ ContactBook: () => null }))
import ContactBookPage from '@/app/dashboard/contact-book/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'SUPER_ADMIN', canAccessContactBook: true } })
  mocks.context.mockResolvedValue({ disabled: false, canAccessContactBook: false, roleTags: new Set() })
})

describe('server contact book page guard', () => {
  it('redirects signed-out users to login', async () => {
    mocks.session.mockResolvedValue(null)
    await expect(ContactBookPage()).rejects.toThrow('redirect:/login')
    expect(mocks.context).not.toHaveBeenCalled()
  })
  it('redirects users without the database flag despite a stale admin session', async () => {
    await expect(ContactBookPage()).rejects.toThrow('redirect:/dashboard')
  })
  it('redirects disabled users even with permission', async () => {
    mocks.context.mockResolvedValue({ disabled: true, canAccessContactBook: true, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    await expect(ContactBookPage()).rejects.toThrow('redirect:/dashboard')
  })
  it('allows a currently enabled user even when the session flag is stale', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', role: 'SERVANT', canAccessContactBook: false } })
    mocks.context.mockResolvedValue({ disabled: false, canAccessContactBook: true, roleTags: new Set() })
    expect(await ContactBookPage()).toBeTruthy()
    expect(mocks.context).toHaveBeenCalledWith('viewer')
  })
  it.each([false, true])('redirects super admins to their dashboard with stored directory flag %s', async canAccessContactBook => {
    mocks.context.mockResolvedValue({ disabled: false, canAccessContactBook, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    await expect(ContactBookPage()).rejects.toThrow('redirect:/dashboard')
  })
  it('honors the password-change gate', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'viewer', mustChangePassword: true } })
    await expect(ContactBookPage()).rejects.toThrow('redirect:/change-password')
  })
})
