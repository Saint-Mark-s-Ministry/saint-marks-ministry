import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserRole } from '@prisma/client'
import { defaultDashboardPath, ViewAsMode } from '@/components/view-as-mode'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  replaceBrowserLocation: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'bishoy',
        name: 'Bishoy Samy',
        email: 'bishoy@example.com',
        role: UserRole.MENTOR,
      },
      impersonating: {
        originalId: 'admin',
        originalName: 'Super Admin',
        originalEmail: 'admin@example.com',
        expiresAt: Date.now() + 60_000,
        readOnly: true,
      },
    },
    update: mocks.update,
  }),
}))

vi.mock('@/lib/browser-navigation', () => ({
  replaceBrowserLocation: mocks.replaceBrowserLocation,
}))

describe('ViewAsMode', () => {
  afterEach(() => {
    mocks.update.mockReset()
    mocks.refresh.mockReset()
    mocks.replaceBrowserLocation.mockReset()
    window.sessionStorage.clear()
    window.history.replaceState(window.history.state, '', '/')
  })

  it('maps each restored account role to its own dashboard', () => {
    expect(defaultDashboardPath(UserRole.SUPER_ADMIN)).toBe('/dashboard/admin')
    expect(defaultDashboardPath(UserRole.PRIEST)).toBe('/dashboard/admin')
    expect(defaultDashboardPath(UserRole.SERVANT_PREP)).toBe('/dashboard/admin')
    expect(defaultDashboardPath(UserRole.MENTOR)).toBe('/dashboard/mentor')
    expect(defaultDashboardPath(UserRole.SERVANT)).toBe('/dashboard/servants')
    expect(defaultDashboardPath(UserRole.STUDENT)).toBe('/dashboard/student')
    expect(defaultDashboardPath(UserRole.PARENT)).toBe('/dashboard/parent')
  })

  it('returns to the page where View as was started', async () => {
    mocks.update.mockResolvedValue({
      user: { id: 'admin', role: UserRole.SUPER_ADMIN },
      impersonating: null,
    })
    window.sessionStorage.setItem(
      'view-as-return-path',
      '/dashboard/servants/classes?year=current#middle-school'
    )

    render(<ViewAsMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(mocks.update).toHaveBeenCalledWith({ impersonate: null })
      expect(mocks.replaceBrowserLocation).toHaveBeenCalledWith(
        '/dashboard/servants/classes?year=current#middle-school'
      )
    })
  })

  it('keeps the active View as banner readable against its warning background', () => {
    render(<ViewAsMode />)

    // Ink text on the warning tint: both tokens swap together in dark mode.
    expect(screen.getByRole('status')).toHaveClass('bg-warn-tint', 'text-ink')
  })

  it('falls back to the restored account dashboard when no return page was saved', async () => {
    mocks.update.mockResolvedValue({
      user: { id: 'admin', role: UserRole.SUPER_ADMIN },
      impersonating: null,
    })

    render(<ViewAsMode />)
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(mocks.replaceBrowserLocation).toHaveBeenCalledWith('/dashboard/admin')
    })
  })
})
