import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolLevel } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  classes: [] as unknown[],
  dashboardData: {} as unknown,
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated' }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolClasses: () => ({
    data: mocks.classes,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useSundaySchoolDashboard: () => ({
    data: mocks.dashboardData,
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}))

import SundaySchoolClassesPage from '@/app/dashboard/servants/classes/page'

describe('Sunday School classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mutate.mockResolvedValue(undefined)
    mocks.classes = [
      {
        id: 'class-1',
        name: 'Middle School',
        level: SundaySchoolLevel.GRADE_6,
        academicYearId: 'year-1',
        isActive: true,
        canCoordinate: true,
        assignments: [],
        _count: { children: 12, sessions: 3 },
      },
    ]
    mocks.dashboardData = {
      standing: { isAdmin: true },
      ageGroups: [
        {
          id: 'middle',
          name: 'Middle School',
          levels: [SundaySchoolLevel.GRADE_6],
          canCoordinate: true,
        },
      ],
    }
  })

  it('lets a coordinator rename a class', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'class-1', name: 'Middle School Boys' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<SundaySchoolClassesPage />)

    await user.click(screen.getByRole('button', { name: 'Edit Middle School name' }))
    const nameInput = screen.getByRole('textbox', { name: 'Class name' })
    await user.clear(nameInput)
    await user.type(nameInput, '  Middle School Boys  ')
    await user.click(screen.getByRole('button', { name: 'Save name' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/sunday-school/classes/class-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Middle School Boys' }),
        })
      )
    })
    expect(mocks.mutate).toHaveBeenCalled()
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Class name updated',
      expect.objectContaining({ description: expect.any(String) })
    )
  })

  it('offers one combined College & Grad level when creating a class', async () => {
    const user = userEvent.setup()

    render(<SundaySchoolClassesPage />)

    await user.click(screen.getByRole('button', { name: 'New class' }))
    const levelSelect = screen.getByRole('combobox', { name: 'Grade level' })

    expect(levelSelect).toHaveTextContent('College & Grad')
    expect(screen.getAllByRole('option', { name: 'College & Grad' })).toHaveLength(1)
    expect(screen.queryByRole('option', { name: 'College' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Grad' })).not.toBeInTheDocument()
  })

  it('offers Special Needs as an Elementary class level', async () => {
    const user = userEvent.setup()
    mocks.dashboardData = {
      standing: { isAdmin: false },
      ageGroups: [
        {
          id: 'elementary',
          name: 'Elementary School',
          levels: [SundaySchoolLevel.GRADE_5, SundaySchoolLevel.SPECIAL_NEEDS],
          canCoordinate: true,
        },
      ],
    }

    render(<SundaySchoolClassesPage />)

    await user.click(screen.getByRole('button', { name: 'New class' }))
    expect(screen.getByRole('option', { name: 'Special Needs' })).toBeInTheDocument()
  })

  it('groups classes by age group and orders classes by grade within each group', () => {
    mocks.classes = [
      {
        id: 'high-10', name: '10th Grade', level: SundaySchoolLevel.GRADE_10,
        academicYearId: 'year-1', isActive: true, canCoordinate: false,
        assignments: [], _count: { children: 0, sessions: 0 },
      },
      {
        id: 'middle-6', name: '6th Grade', level: SundaySchoolLevel.GRADE_6,
        academicYearId: 'year-1', isActive: true, canCoordinate: false,
        assignments: [], _count: { children: 0, sessions: 0 },
      },
      {
        id: 'elementary-2', name: '2nd Grade', level: SundaySchoolLevel.GRADE_2,
        academicYearId: 'year-1', isActive: true, canCoordinate: false,
        assignments: [], _count: { children: 0, sessions: 0 },
      },
      {
        id: 'high-9', name: '9th Grade', level: SundaySchoolLevel.GRADE_9,
        academicYearId: 'year-1', isActive: true, canCoordinate: false,
        assignments: [], _count: { children: 0, sessions: 0 },
      },
    ]
    mocks.dashboardData = {
      standing: { isAdmin: true },
      ageGroups: [
        {
          id: 'high', name: 'High School',
          levels: [SundaySchoolLevel.GRADE_9, SundaySchoolLevel.GRADE_10],
          canCoordinate: false,
        },
        {
          id: 'elementary', name: 'Elementary School',
          levels: [SundaySchoolLevel.GRADE_2], canCoordinate: false,
        },
        {
          id: 'middle', name: 'Middle School',
          levels: [SundaySchoolLevel.GRADE_6], canCoordinate: false,
        },
      ],
    }

    render(<SundaySchoolClassesPage />)
    const cards = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.closest('section') as HTMLElement)

    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual([
      'Elementary School',
      'Middle School',
      'High School',
    ])
    expect(
      within(cards[2] as HTMLElement).getAllByRole('link')
        .map(link => link.textContent?.trim())
        .filter(label => label !== 'Open')
    ).toEqual(['9th Grade', '10th Grade'])
  })
})
