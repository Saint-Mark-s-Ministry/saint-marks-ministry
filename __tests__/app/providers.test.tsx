import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: {
    data: { expires: '2099-01-01' } as { expires: string; user?: { role: string } } | null,
    status: 'authenticated' as 'authenticated' | 'unauthenticated' | 'loading',
  },
  signOut: vi.fn(),
  child: vi.fn(),
  themeProvider: vi.fn(({ children }: { children: React.ReactNode }) => children),
}))

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mocks.auth,
  signOut: mocks.signOut,
}))
vi.mock('next-themes', () => ({
  ThemeProvider: (props: { children: React.ReactNode }) => mocks.themeProvider(props),
}))

import { Providers } from '@/app/providers'

function SessionConsumer() {
  mocks.child()
  return <div>App content</div>
}

describe('Providers session recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.data = { expires: '2099-01-01' }
    mocks.auth.status = 'authenticated'
    mocks.signOut.mockResolvedValue(undefined)
  })

  it('follows the device theme by default', () => {
    mocks.auth.data = null
    mocks.auth.status = 'unauthenticated'
    render(<Providers><span>Application</span></Providers>)
    expect(screen.getByText('Application')).toBeInTheDocument()
    expect(mocks.themeProvider).toHaveBeenCalledWith(expect.objectContaining({
      attribute: 'class', defaultTheme: 'system', enableSystem: true,
    }))
  })

  it('clears revoked sessions before mounting any app or login consumers', async () => {
    render(<Providers><SessionConsumer /></Providers>)
    expect(mocks.child).not.toHaveBeenCalled()
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ callbackUrl: '/login' }))
    expect(screen.getByRole('status')).toHaveTextContent(/session has ended/i)
  })

  it('handles revocation while the user already has a page open', async () => {
    mocks.auth.data = { expires: '2099-01-01', user: { role: 'MENTOR' } }
    const { rerender } = render(<Providers><SessionConsumer /></Providers>)
    expect(screen.getByText('App content')).toBeInTheDocument()
    mocks.child.mockClear()
    mocks.auth.data = { expires: '2099-01-01' }
    rerender(<Providers><SessionConsumer /></Providers>)
    expect(mocks.child).not.toHaveBeenCalled()
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1))
  })

  it('starts only one sign-out request when effects replay in Strict Mode', async () => {
    render(<StrictMode><Providers><SessionConsumer /></Providers></StrictMode>)
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1))
    expect(mocks.child).not.toHaveBeenCalled()
  })

  it.each(['loading', 'unauthenticated', 'authenticated'] as const)('preserves normal %s sessions', status => {
    mocks.auth.status = status
    mocks.auth.data = status === 'authenticated' ? { expires: '2099-01-01', user: { role: 'MENTOR' } } : null
    render(<Providers><SessionConsumer /></Providers>)
    expect(screen.getByText('App content')).toBeInTheDocument()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('allows retrying if the sign-out request fails', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('Offline'))
    render(<Providers><SessionConsumer /></Providers>)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(2))
    expect(mocks.child).not.toHaveBeenCalled()
  })
})
