import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolAuthority, SundaySchoolLevel, UserRole } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'class-1' }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({
    status: 'authenticated',
    session: {
      user: {
        id: 'coordinator-1',
        role: UserRole.SERVANT,
        sundaySchool: { hasAccess: true, isCoordinator: true },
      },
    },
  }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolClass: () => ({
    data: {
      id: 'class-1',
      name: 'Grade 6',
      level: SundaySchoolLevel.GRADE_6,
      academicYearId: 'year-1',
      isActive: true,
      children: [],
      sessions: [],
      weeklyLessons: [],
      canServe: true,
      canCoordinate: true,
      canDelete: false,
      canTakeServantAttendance: true,
      assignments: [
        {
          id: 'coordinator-assignment',
          userId: 'coordinator-1',
          academicYearId: 'year-1',
          authority: SundaySchoolAuthority.COORDINATOR,
          classId: 'class-1',
          ageGroupId: null,
          user: {
            id: 'coordinator-1',
            name: 'Current Coordinator',
            email: 'current@example.com',
            phone: '555-0100',
            profileImageUrl: null,
          },
        },
        {
          id: 'servant-assignment',
          userId: 'servant-2',
          academicYearId: 'year-1',
          authority: SundaySchoolAuthority.SERVANT,
          classId: 'class-1',
          ageGroupId: null,
          user: {
            id: 'servant-2',
            name: 'Next Coordinator',
            email: 'next@example.com',
            phone: '555-0101',
            profileImageUrl: null,
          },
        },
      ],
    },
    isLoading: false,
    mutate: mocks.mutate,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

vi.mock('@/components/user-organization-dialog', () => ({
  UserOrganizationDialog: ({ user }: { user: { name: string } }) => (
    <div role="dialog">Organization for {user.name}</div>
  ),
}))

import SundaySchoolClassDetailPage from '@/app/dashboard/servants/classes/[id]/page'

describe('Sunday School class staffing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
  })

  it('promotes another servant and demotes the current coordinator without removing either', async () => {
    const user = userEvent.setup()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue([]) })
      .mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: 'new-assignment' }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<SundaySchoolClassDetailPage />)

    await user.click(screen.getByRole('button', { name: 'Make coordinator' }))
    await user.click(screen.getByRole('button', { name: 'Make servant' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/sunday-school/servant-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'servant-2',
          classId: 'class-1',
          authority: SundaySchoolAuthority.COORDINATOR,
        }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/sunday-school/servant-assignments',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'coordinator-1',
          classId: 'class-1',
          authority: SundaySchoolAuthority.SERVANT,
        }),
      })
    )
    expect(mocks.mutate).toHaveBeenCalledTimes(2)
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Next Coordinator is now a coordinator')
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Coordinator role removed from Current Coordinator'
    )
  })

  it('opens contact details from an assigned servant and offers the organization chart', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    }))

    render(<SundaySchoolClassDetailPage />)

    await user.click(screen.getByRole('button', {
      name: "View Next Coordinator's contact information",
    }))

    await user.click(screen.getByRole('button', { name: /Contact options for servant's email/ }))
    expect(await screen.findByRole('menuitem', { name: 'Send Email' })).toHaveAttribute(
      'href',
      'mailto:next@example.com'
    )
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /Contact options for servant's phone number/ }))
    expect(await screen.findByRole('menuitem', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:5550101'
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'View organization' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Organization for Next Coordinator')
  })
})
