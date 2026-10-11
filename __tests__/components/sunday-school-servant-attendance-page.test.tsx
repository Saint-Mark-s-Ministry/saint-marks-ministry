import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolAuthority, SundaySchoolLevel } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useClasses: vi.fn(),
  useAttendance: vi.fn(),
  useDashboard: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({
    status: 'authenticated',
    session: { user: { sundaySchool: { hasAccess: true } } },
  }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useSundaySchoolClasses: mocks.useClasses,
  useSundaySchoolServantAttendance: mocks.useAttendance,
  useSundaySchoolDashboard: mocks.useDashboard,
}))

vi.mock('@/components/sunday-school-recent-attendance-chart', () => ({
  SundaySchoolRecentAttendanceChart: () => null,
}))

vi.mock('@/components/user-organization-dialog', () => ({
  UserOrganizationDialog: ({ user }: { user: { name: string } }) => (
    <div role="dialog">Organization for {user.name}</div>
  ),
}))

import ServantAttendancePage from '@/app/dashboard/servants/servant-attendance/page'

describe('Sunday School servant attendance page', () => {
  beforeEach(() => {
    mocks.useClasses.mockReturnValue({
      data: [{
        id: 'class-1',
        name: '8th Grade',
        level: SundaySchoolLevel.GRADE_8,
        academicYearId: 'year-1',
        isActive: true,
        canViewServantAttendance: true,
        assignments: [{ classId: 'class-1' }],
      }],
      isLoading: false,
    })
    mocks.useAttendance.mockReturnValue({
      data: {
        canEdit: true,
        roster: [{
          id: 'assignment-1',
          userId: 'servant-1',
        name: 'Mina Servant',
        email: 'mina@example.com',
        phone: '555-0100',
        profileImageUrl: null,
          authority: SundaySchoolAuthority.SERVANT,
          attendance: null,
        }],
      },
      isLoading: false,
      mutate: vi.fn(),
    })
    mocks.useDashboard.mockReturnValue({
      data: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    })
  })

  it('opens contact details from a servant name and offers the organization chart', async () => {
    const user = userEvent.setup()
    render(<ServantAttendancePage />)

    await user.click(await screen.findByRole('button', { name: "View Mina Servant's contact information" }))

    await user.click(screen.getByRole('button', { name: /Contact options for servant's email/ }))
    expect(await screen.findByRole('menuitem', { name: 'Send Email' })).toHaveAttribute('href', 'mailto:mina@example.com')
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /Contact options for servant's phone number/ }))
    expect(await screen.findByRole('menuitem', { name: 'Call' })).toHaveAttribute('href', 'tel:5550100')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'View organization' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Organization for Mina Servant')
  })
})
