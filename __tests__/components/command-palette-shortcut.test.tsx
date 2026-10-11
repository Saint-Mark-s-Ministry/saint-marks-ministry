import { fireEvent, render, screen, within } from '@testing-library/react'
import { UserRole } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { role: UserRole.SUPER_ADMIN } }, status: 'authenticated' }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admin',
  useRouter: () => ({ push: vi.fn() }),
}))

import { CommandPalette } from '@/components/command-palette'

describe('CommandPalette shortcut hint', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('shows Ctrl+K on Windows desktop and hides the hint on phones', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    render(<CommandPalette />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command Palette' })
    const hint = within(dialog).getByText('to toggle').closest('span')

    expect(hint).toHaveTextContent('Ctrl+K')
    expect(hint).toHaveClass('hidden', 'md:inline')
  })

  it('shows ⌘K on Mac desktop', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    render(<CommandPalette />)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command Palette' })

    expect(within(dialog).getByText('to toggle').closest('span')).toHaveTextContent('⌘K')
  })
})
