import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/servants',
  push: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: {
        id: 'priest-1',
        name: 'Rev. Fr. Daniel Abdel-Maseih',
        email: 'daniel@example.com',
        role: UserRole.PRIEST,
        profileImageUrl: null,
        sundaySchool: { hasAccess: true },
      },
    },
  }),
  signOut: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}))

vi.mock('@/components/notifications/notification-bell', () => ({
  NotificationBell: () => <button type="button">Notifications</button>,
}))

import { Navbar } from '@/components/navbar'

describe('Navbar with long names', () => {
  beforeEach(() => {
    mocks.pathname = '/dashboard/servants'
    mocks.push.mockClear()
  })

  it('hides an oversized identity label and uses meaningful avatar initials', () => {
    render(<Navbar />)

    const name = screen.getByText('Rev. Fr. Daniel Abdel-Maseih')
    expect(name.parentElement).toHaveClass('hidden')
    expect(name.parentElement).not.toHaveClass('2xl:flex')
    expect(screen.getByText('DA')).toBeInTheDocument()
    expect(screen.queryByText('RFDA')).not.toBeInTheDocument()
  })

  it('offers priests the read-only servant attendance page in Sunday School mode', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: /more/i }))

    expect(await screen.findByRole('menuitem', { name: 'Servant attendance' })).toHaveAttribute(
      'href',
      '/dashboard/servants/servant-attendance'
    )
  })

  it('keeps the desktop page scrollbar stable while the More menu is open', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: /more/i }))

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
  })

  it('puts the logo-based service switcher in the profile menu', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByAltText('Servants Prep logo')).toBeInTheDocument()
    expect(screen.getByAltText('Sunday School logo')).toBeInTheDocument()
    expect(screen.getByText('Current service')).toBeInTheDocument()
    const serviceRows = Array.from(document.querySelectorAll('[data-service-option]'))
    expect(serviceRows).toHaveLength(2)
    for (const row of serviceRows) {
      expect(row).toHaveClass('mx-1', 'h-16', 'gap-3', 'px-2', 'py-2')
      expect(row.querySelector('img')).toHaveClass('h-8', 'w-8')
    }
    expect(document.querySelector('[data-service-option][aria-current="page"]')).toHaveClass(
      'bg-accent/60'
    )
    expect(serviceRows.find(row => !row.hasAttribute('aria-current'))).toHaveClass(
      'focus:bg-accent/60'
    )
    expect(screen.getByRole('menuitem', { name: 'Switch to Servants Prep' })).toHaveAttribute(
      'href',
      '/dashboard/admin'
    )
  })

  it('keeps the desktop page scrollbar stable while the profile menu is open', async () => {
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    expect(await screen.findByRole('menu')).toBeInTheDocument()
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
  })

  it('offers the same logo switcher from Servants Prep', async () => {
    mocks.pathname = '/dashboard/admin'
    const user = userEvent.setup()
    render(<Navbar />)

    await user.click(screen.getByRole('button', { name: 'Open profile menu' }))

    expect(screen.getByAltText('Servants Prep logo')).toBeInTheDocument()
    expect(screen.getByAltText('Sunday School logo')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Switch to Sunday School' })).toHaveAttribute(
      'href',
      '/dashboard/servants'
    )
  })
})
