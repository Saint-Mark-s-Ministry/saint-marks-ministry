import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  authState: {
    data: { expires: '2099-01-01T00:00:00.000Z' } as { expires: string } | null,
    status: 'authenticated' as 'authenticated' | 'unauthenticated',
  },
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  passkeysEnabled: false,
  startAuthentication: vi.fn(),
  request: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => mocks.authState,
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}))

vi.mock('@/lib/swr', () => ({ usePasskeyAvailability: () => ({ data: { enabled: mocks.passkeysEnabled } }) }))
vi.mock('@simplewebauthn/browser', () => ({ browserSupportsWebAuthn: () => true, startAuthentication: mocks.startAuthentication }))
vi.mock('@/lib/passkey-client', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/passkey-client')>()), passkeyRequest: mocks.request,
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}))

import LoginPage from '@/app/login/page'

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.authState.data = { expires: '2099-01-01T00:00:00.000Z' }
    mocks.authState.status = 'authenticated'
    mocks.push.mockReset()
    mocks.replace.mockReset()
    mocks.refresh.mockReset()
    mocks.signIn.mockReset()
    mocks.passkeysEnabled = false
    mocks.startAuthentication.mockReset()
    mocks.request.mockReset()
    mocks.signOut.mockReset()
    mocks.signOut.mockImplementation(async () => {
      mocks.authState.data = null
      mocks.authState.status = 'unauthenticated'
    })
  })

  it('clears an invalidated session instead of hanging on Redirecting', async () => {
    render(<LoginPage />)

    await waitFor(() => {
      expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false })
    })
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/login')
      expect(mocks.refresh).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    })
  })

  it('presents one shared portal for Servants Prep and Sunday School', () => {
    mocks.authState.data = null
    mocks.authState.status = 'unauthenticated'

    render(<LoginPage />)

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'St. Mark Ministry Portal' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Servants Prep')).toBeInTheDocument()
    expect(screen.getByText('Sunday School')).toBeInTheDocument()
    expect(screen.getByText(/sign in once to access the ministries/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign up as a Sunday School servant' })).toHaveAttribute(
      'href',
      '/signup/servant'
    )
  })

  it('signs in with a passkey without requiring email or password', async () => {
    mocks.authState.data = null
    mocks.authState.status = 'unauthenticated'
    mocks.passkeysEnabled = true
    mocks.request.mockResolvedValue({ challenge: 'test' })
    mocks.startAuthentication.mockResolvedValue({ id: 'credential' })
    mocks.signIn.mockResolvedValue({ ok: true })
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('passkey', { response: '{"id":"credential"}', redirect: false }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/dashboard'))
  })

  it('lets users return to password login after cancelling a passkey prompt', async () => {
    mocks.authState.data = null
    mocks.authState.status = 'unauthenticated'
    mocks.passkeysEnabled = true
    mocks.request.mockResolvedValue({ challenge: 'test' })
    mocks.startAuthentication.mockRejectedValue(new DOMException('Cancelled', 'NotAllowedError'))
    render(<LoginPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with a passkey' }))
    await screen.findByText(/Passkey request cancelled or timed out/)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(mocks.signIn).not.toHaveBeenCalled()
  })

  it('hides passkey login until the deployment enables it', () => {
    mocks.authState.data = null
    mocks.authState.status = 'unauthenticated'
    render(<LoginPage />)
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).not.toBeInTheDocument()
  })
})
