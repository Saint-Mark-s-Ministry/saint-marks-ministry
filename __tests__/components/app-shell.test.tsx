import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserRole } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/servants',
  push: vi.fn(),
  openExams: [] as { id: string }[],
  user: {} as Record<string, unknown>,
  status: 'authenticated' as 'authenticated' | 'loading' | 'unauthenticated',
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: mocks.status === 'authenticated' ? { user: mocks.user } : null, status: mocks.status }),
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

vi.mock('@/components/annual-mentor-reminder-banner', () => ({
  AnnualMentorReminderBanner: () => null,
}))

vi.mock('@/lib/swr', () => ({
  useDigitalExams: () => ({ data: { exams: mocks.openExams } }),
  useAcademicYears: () => ({ data: [{ id: 'y', name: '2026-2027', isActive: true }] }),
}))

import { AppShell } from '@/components/shell/app-shell'

const sidebar = () => screen.getByRole('complementary', { name: 'Main' })

describe('AppShell', () => {
  afterEach(() => vi.restoreAllMocks())

  beforeEach(() => {
    mocks.pathname = '/dashboard/servants'
    mocks.status = 'authenticated'
    mocks.push.mockClear()
    mocks.openExams = []
    mocks.user = {
      id: 'priest-1',
      name: 'Rev. Fr. Daniel Abdel-Maseih',
      role: UserRole.PRIEST,
      profileImageUrl: null,
      sundaySchool: { hasAccess: true, isCoordinator: false },
    }
  })

  it('shows the student exam link only while an eligible exam is open', () => {
    mocks.pathname = '/dashboard/student'
    mocks.user = { id: 'student-1', name: 'Student', role: UserRole.STUDENT }
    const { rerender } = render(<AppShell>page</AppShell>)
    expect(within(sidebar()).queryByRole('link', { name: 'Exam answer sheets' })).not.toBeInTheDocument()
    mocks.openExams = [{ id: 'open-exam' }]
    rerender(<AppShell>page</AppShell>)
    expect(within(sidebar()).getByRole('link', { name: 'Exam answer sheets' })).toHaveAttribute('href', '/dashboard/student/exams')
    mocks.openExams = []
    rerender(<AppShell>page</AppShell>)
    expect(within(sidebar()).queryByRole('link', { name: 'Exam answer sheets' })).not.toBeInTheDocument()
  })

  it('offers priests the read-only servant attendance page in Sunday School mode', () => {
    render(<AppShell>page</AppShell>)
    expect(within(sidebar()).getByRole('link', { name: 'Servant attendance' })).toHaveAttribute(
      'href',
      '/dashboard/servants/servant-attendance'
    )
  })

  it('shows servant attendance to a servant who is not a coordinator', () => {
    mocks.user = { ...mocks.user, role: UserRole.SERVANT, name: 'Mina Servant' }
    render(<AppShell>page</AppShell>)
    expect(within(sidebar()).getByRole('link', { name: 'Servant attendance' })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Child registrations' })).not.toBeInTheDocument()
  })

  it('uses meaningful initials for long clerical names', () => {
    render(<AppShell>page</AppShell>)
    expect(within(sidebar()).getByText('DA')).toBeInTheDocument()
    expect(within(sidebar()).queryByText('RFDA')).not.toBeInTheDocument()
  })

  it('switches the accent to Sunday School and marks the current page', () => {
    mocks.pathname = '/dashboard/servants/roster'
    const { container } = render(<AppShell>page</AppShell>)
    expect(container.querySelector('[data-ministry]')).toHaveAttribute('data-ministry', 'sunday-school')
    expect(within(sidebar()).getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Sunday SchoolRoster')
  })

  it('lets someone in both ministries switch between them', async () => {
    mocks.pathname = '/dashboard/admin'
    mocks.user = { ...mocks.user, role: UserRole.SUPER_ADMIN, name: 'Kamal Youssef' }
    render(<AppShell>page</AppShell>)
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Switch ministry/ }))
    const menu = await screen.findByRole('menu')
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
    expect(within(menu).getByRole('menuitem', { name: /Sunday School/ })).toHaveAttribute('href', '/dashboard/servants')
    expect(within(menu).getByRole('menuitem', { name: /Servants Prep/ })).toHaveAttribute('href', '/dashboard/admin')
  })

  it('shows the platform shortcut on desktop and hides it on phone layouts', async () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('Win32')
    mocks.pathname = '/dashboard/admin'
    mocks.user = { ...mocks.user, role: UserRole.SUPER_ADMIN }
    render(<AppShell>page</AppShell>)

    expect(within(sidebar()).getByRole('button', { name: 'Search (Ctrl+K)' })).toHaveTextContent('Ctrl+K')

    await userEvent.click(within(sidebar()).getByRole('button', { name: /Switch ministry/ }))
    const shortcut = within(await screen.findByRole('menu')).getByText('Ctrl+2')

    expect(shortcut).toHaveClass('hidden', 'md:inline')
  })

  it('shows the Command shortcut for Search on Mac', () => {
    vi.spyOn(window.navigator, 'platform', 'get').mockReturnValue('MacIntel')
    render(<AppShell>page</AppShell>)

    expect(within(sidebar()).getByRole('button', { name: 'Search (⌘K)' })).toHaveTextContent('⌘K')
  })

  it('closes the ministry menu once the other ministry renders', async () => {
    mocks.pathname = '/dashboard/admin'
    mocks.user = { ...mocks.user, role: UserRole.SUPER_ADMIN }
    const { rerender } = render(<AppShell>page</AppShell>)
    await userEvent.click(within(sidebar()).getByRole('button', { name: /Switch ministry/ }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    mocks.pathname = '/dashboard/servants'
    rerender(<AppShell>page</AppShell>)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows a plain label, not a switcher, with one ministry', () => {
    mocks.user = { ...mocks.user, role: UserRole.SERVANT }
    render(<AppShell>page</AppShell>)
    expect(within(sidebar()).queryByRole('button', { name: /Switch ministry/ })).not.toBeInTheDocument()
  })

  it('jumps between ministries with Command+1 and Command+2', async () => {
    mocks.pathname = '/dashboard/admin'
    mocks.user = { ...mocks.user, role: UserRole.SUPER_ADMIN }
    render(<AppShell>page</AppShell>)
    await userEvent.keyboard('{Meta>}2{/Meta}')
    expect(mocks.push).toHaveBeenCalledWith('/dashboard/servants')
  })

  it('leaves sign-in and public pages without the shell', () => {
    mocks.pathname = '/login'
    render(<AppShell>page</AppShell>)
    expect(screen.queryByRole('complementary', { name: 'Main' })).not.toBeInTheDocument()
    expect(screen.getByText('page')).toBeInTheDocument()
  })

  it('shows the active academic year in prep mode', () => {
    mocks.pathname = '/dashboard/admin'
    mocks.user = { ...mocks.user, role: UserRole.SUPER_ADMIN }
    render(<AppShell>page</AppShell>)
    expect(screen.getByTitle('Academic year')).toHaveTextContent('Active academic year: 2026–2027')
  })
})
