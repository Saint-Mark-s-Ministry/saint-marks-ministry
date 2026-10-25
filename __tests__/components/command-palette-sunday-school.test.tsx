import { fireEvent, render, screen, within } from '@testing-library/react'
import { UserRole } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: { role: 'SERVANT', sundaySchool: { hasAccess: true, isCoordinator: false, hasHomeworkAccess: true } } as Record<string, unknown>,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: mocks.user }, status: 'authenticated' }),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/servants',
  useRouter: () => ({ push: vi.fn() }),
}))

import { CommandPalette } from '@/components/command-palette'

async function openPalette() {
  render(<CommandPalette />)
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  return screen.findByRole('dialog', { name: 'Command Palette' })
}

describe('Sunday School search', () => {
  beforeEach(() => {
    mocks.user = { role: UserRole.SERVANT, sundaySchool: { hasAccess: true, isCoordinator: false, hasHomeworkAccess: true } }
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('lists the same places as the menu, plus the pages inside each hub', async () => {
    const dialog = await openPalette()
    for (const label of ['Home', 'Attendance', 'Children', 'Care', 'Lessons', 'Visits & calls', 'Birthdays', 'Homework', 'My account']) {
      expect(within(dialog).getByText(label)).toBeInTheDocument()
    }
    // Ministry pages are for coordinators.
    expect(within(dialog).queryByText('Reports')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Servant attendance')).not.toBeInTheDocument()
  })

  it('still finds a page by the name it used to have', async () => {
    const dialog = await openPalette()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'roster' } })
    expect(within(dialog).getByText('Children')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'visitations' } })
    expect(within(dialog).getByText('Visits & calls')).toBeInTheDocument()
  })

  it('offers ministry pages to coordinators', async () => {
    mocks.user = { role: UserRole.SERVANT, sundaySchool: { hasAccess: true, isCoordinator: true, hasHomeworkAccess: false } }
    const dialog = await openPalette()
    expect(within(dialog).getByText('Reports')).toBeInTheDocument()
    expect(within(dialog).getByText('Servant attendance')).toBeInTheDocument()
    expect(within(dialog).queryByText('Homework')).not.toBeInTheDocument()
  })
})
