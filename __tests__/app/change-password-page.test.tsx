import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  session: {
    user: {
      email: 'mentor@example.com',
      role: 'MENTOR',
      mustChangePassword: true,
    },
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh, back: vi.fn() }),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: mocks.session,
  }),
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

import ChangePasswordPage from '@/app/change-password/page'

describe('ChangePasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signIn.mockResolvedValue({ ok: true, error: null })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: 'Password updated successfully',
        destination: '/dashboard/mentor',
      }),
    }))
  })

  it('creates a fresh session and sends a standalone mentor to the mentor dashboard', async () => {
    render(<ChangePasswordPage />)

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'Welcome123!' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPassword123!' } })
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'NewPassword123!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }))

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('credentials', {
        email: 'mentor@example.com',
        password: 'NewPassword123!',
        redirect: false,
      })
      expect(mocks.replace).toHaveBeenCalledWith('/dashboard/mentor')
      expect(mocks.refresh).toHaveBeenCalled()
    })
  })
})
