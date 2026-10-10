import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), session: { user: { id: 'admin', role: 'SUPER_ADMIN' }, impersonating: null as object | null } }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: mocks.session, status: 'authenticated', update: mocks.refresh }) }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ session: mocks.session, status: 'authenticated' }) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/admin/users' }))

import UsersPage from '@/app/dashboard/admin/users/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.impersonating = null
  Element.prototype.scrollIntoView = vi.fn()
})

describe('user contact book configuration', () => {
  it('renders synchronized desktop and mobile checkboxes and saves through the dedicated endpoint', async () => {
    const user = userEvent.setup()
    const target = { id: 'target', name: 'Mariam', email: 'mariam@example.com', role: 'STUDENT', phone: null, roleAssignments: [{ tag: RoleTag.SERVANTS_PREP_STUDENT }], canAccessContactBook: false }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({
      ok: true, json: async () => init?.method ? target : url.startsWith('/api/users') ? [target] : [],
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<UsersPage />)
    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const switches = screen.getAllByRole('checkbox', { name: 'Allow contact book access' })
    expect(switches).toHaveLength(2)
    await user.click(switches[0])
    expect(switches[1]).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/admin/users/target/contact-book-access', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ canAccessContactBook: true }) })))
    const profileCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(profileCall![1]!.body as string)).not.toHaveProperty('canAccessContactBook')
  })

  it('does not show or save a redundant access checkbox for super admins', async () => {
    const target = { id: 'admin', name: 'Admin', email: 'admin@example.com', role: 'SUPER_ADMIN', roleAssignments: [{ tag: RoleTag.SUPER_ADMIN }], canAccessContactBook: false }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method ? target : [target] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<UsersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.queryByRole('checkbox', { name: 'Allow contact book access' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/users/admin', expect.objectContaining({ method: 'PATCH' })))
    expect(fetchMock.mock.calls.some(([url]) => url.includes('contact-book-access'))).toBe(false)
  })
})
