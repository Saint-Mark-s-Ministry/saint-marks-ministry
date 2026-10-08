import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  RoleTag,
  SundaySchoolAuthority,
  SundaySchoolLevel,
  UserRole,
} from '@prisma/client'

const pathname = vi.hoisted(() => ({ value: '/dashboard/admin/users' }))
vi.mock('next/navigation', async importOriginal => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => pathname.value,
}))

vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => ({
    status: 'authenticated',
    session: { user: { id: 'admin-1', role: UserRole.SUPER_ADMIN } },
  }),
}))

import UsersPage from '@/app/dashboard/admin/users/page'

describe('user management Sunday School assignments', () => {
  beforeEach(() => {
    pathname.value = '/dashboard/admin/users'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        {
          id: 'servant-1',
          name: 'Mina Servant',
          email: 'mina@example.com',
          phone: null,
          role: UserRole.SERVANT,
          roleAssignments: [{ tag: RoleTag.SUNDAY_SCHOOL_SERVANT }],
          sundaySchoolServing: [
            {
              class: { level: SundaySchoolLevel.GRADE_6 },
              ageGroup: null,
            },
          ],
          isDisabled: false,
          _count: { mentoredStudents: 0 },
        },
      ]),
    }))
  })

  it('shows assigned grades in their own column without the redundant badge', async () => {
    render(<UsersPage />)

    expect(await screen.findByRole('columnheader', { name: 'SS grades' }))
      .toBeInTheDocument()

    await waitFor(() => {
      const row = screen.getByRole('row', { name: /Mina Servant/ })
      expect(within(row).getByText('6th Grade')).toBeInTheDocument()
    })

    expect(screen.queryByText('Assigned to Sunday School')).not.toBeInTheDocument()
    expect(screen.getAllByText('Sunday School Servant').length).toBeGreaterThan(0)
  })

  it('assigns a servant to a classroom from the Sunday School users page', async () => {
    const user = userEvent.setup()
    const servant = {
      id: 'servant-1',
      name: 'Mina Servant',
      email: 'mina@example.com',
      phone: null,
      role: UserRole.SERVANT,
      roleAssignments: [{ tag: RoleTag.SUNDAY_SCHOOL_SERVANT }],
      sundaySchoolServing: [],
      isDisabled: false,
      _count: { mentoredStudents: 0 },
    }
    let assigned = false
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/sunday-school/classes?isActive=true') {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            {
              id: 'class-1',
              name: '6th Grade A',
              level: SundaySchoolLevel.GRADE_6,
              academicYearId: 'year-1',
              isActive: true,
              assignments: [],
            },
          ]),
        }
      }
      if (url === '/api/sunday-school/servant-assignments' && init?.method === 'POST') {
        assigned = true
        return {
          ok: true,
          json: vi.fn().mockResolvedValue({ id: 'assignment-1' }),
        }
      }
      if (url.startsWith('/api/users')) {
        return {
          ok: true,
          json: vi.fn().mockResolvedValue([
            {
              ...servant,
              sundaySchoolServing: assigned
                ? [
                    {
                      id: 'assignment-1',
                      authority: SundaySchoolAuthority.SERVANT,
                      classId: 'class-1',
                      ageGroupId: null,
                      class: {
                        id: 'class-1',
                        name: '6th Grade A',
                        level: SundaySchoolLevel.GRADE_6,
                      },
                      ageGroup: null,
                    },
                  ]
                : [],
            },
          ]),
        }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    pathname.value = '/dashboard/servants/users'
    render(<UsersPage />)

    const manageButtons = await screen.findAllByRole('button', { name: 'Manage classes' })
    await user.click(manageButtons[0])
    expect(await screen.findByText('6th Grade A')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Assign' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sunday-school/servant-assignments',
        expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          userId: 'servant-1',
          classId: 'class-1',
          authority: SundaySchoolAuthority.SERVANT,
        }),
        })
      )
    })
  })
})
