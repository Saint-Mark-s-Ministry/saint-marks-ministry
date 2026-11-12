import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  availability: { data: undefined as { enabled: boolean } | undefined, error: undefined as Error | undefined, mutate: vi.fn() },
  impersonating: false,
  passkeys: vi.fn(),
}))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { impersonating: mocks.impersonating ? { originalId: 'admin-1' } : null } }) }))
vi.mock('@/lib/swr', () => ({ usePasskeyAvailability: () => mocks.availability, usePasskeys: mocks.passkeys }))
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => true, startRegistration: vi.fn() }))
import { PasskeySettings } from '@/components/passkey-settings'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.availability.data = undefined
  mocks.availability.error = undefined
  mocks.impersonating = false
  mocks.passkeys.mockReturnValue({ data: { passkeys: [] }, isLoading: false, mutate: vi.fn() })
})

describe('My account passkey visibility', () => {
  it('shows a loading section while checking availability', () => {
    render(<PasskeySettings />)
    expect(screen.getByText('Passkeys')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Checking passkey availability')
    expect(mocks.passkeys).toHaveBeenCalledWith(false)
  })
  it('keeps the section visible when the server disables passkeys', () => {
    mocks.availability.data = { enabled: false }
    render(<PasskeySettings />)
    expect(screen.getByText('Passkeys')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Passkey setup is currently unavailable')
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(mocks.availability.mutate).toHaveBeenCalledOnce()
    expect(mocks.passkeys).toHaveBeenCalledWith(false)
  })
  it('offers a retry when the availability request fails', () => {
    mocks.availability.error = new Error('Request failed')
    render(<PasskeySettings />)
    expect(screen.getByRole('alert')).toHaveTextContent('Passkey setup is currently unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(mocks.availability.mutate).toHaveBeenCalledOnce()
  })
  it('shows setup controls after availability becomes enabled', () => {
    mocks.availability.data = { enabled: false }
    const { rerender } = render(<PasskeySettings />)
    mocks.availability.data = { enabled: true }
    rerender(<PasskeySettings />)
    expect(screen.getByLabelText('Passkey name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toBeInTheDocument()
    expect(mocks.passkeys).toHaveBeenLastCalledWith(true)
  })
  it('still hides account security management in View as mode', () => {
    mocks.impersonating = true
    mocks.availability.data = { enabled: true }
    render(<PasskeySettings />)
    expect(screen.queryByText('Passkeys')).not.toBeInTheDocument()
    expect(mocks.passkeys).toHaveBeenCalledWith(false)
  })
})
