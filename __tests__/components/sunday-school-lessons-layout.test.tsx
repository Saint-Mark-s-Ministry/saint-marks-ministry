import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SundaySchoolLevel } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  lessons: [] as unknown[],
  mutate: vi.fn(),
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({
    status: 'authenticated',
    session: { user: { id: 'servant-1', name: 'Jane Servant' } },
  }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolLessons: () => ({
    data: { lessons: mocks.lessons },
    error: undefined,
    isLoading: false,
    mutate: mocks.mutate,
  }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
}))

vi.mock('@/components/sunday-school-lesson-import', () => ({
  SundaySchoolLessonImport: () => null,
}))

import SundaySchoolLessonsPage from '@/app/dashboard/servants/lessons/page'

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lesson-1',
    classId: 'class-1',
    sundayDate: '2026-09-26T00:00:00.000Z',
    title: 'The feast of the Cross',
    ownerId: 'servant-1',
    assignedById: 'servant-1',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    class: { id: 'class-1', name: '1st Grade - 1', level: SundaySchoolLevel.GRADE_1 },
    owner: { id: 'servant-1', name: 'Jane Servant', profileImageUrl: null },
    resources: [],
    status: 'NEEDS_LINKS',
    canEdit: true,
    canAssignOwner: true,
    eligibleOwners: [{ id: 'servant-1', name: 'Jane Servant', email: 'jane@example.com', profileImageUrl: null }],
    ...overrides,
  }
}

describe('Sunday School lesson schedule layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lessons = []
  })

  it('constrains long resource titles and keeps actions consistently aligned', () => {
    const longUrl = 'https://docs.google.com/presentation/d/very-long-presentation-id/edit?slide=id.really-long-slide-name'
    mocks.lessons = [
      lesson({
        status: 'READY',
        resources: [{
          id: 'resource-1',
          weeklyLessonId: 'lesson-1',
          title: longUrl,
          url: longUrl,
          sortOrder: 0,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        }],
      }),
      lesson({ id: 'lesson-2', classId: 'class-2', class: { id: 'class-2', name: '2nd Grade - 1', level: SundaySchoolLevel.GRADE_2 } }),
    ]

    render(<SundaySchoolLessonsPage />)

    const resourceLink = screen.getByRole('link')
    expect(resourceLink).toHaveClass('min-w-0', 'max-w-full')
    expect(screen.getByText(longUrl)).toHaveClass('truncate')

    const readyActions = screen.getByText('Ready').parentElement?.parentElement
    expect(readyActions).toBeTruthy()
    expect(within(readyActions as HTMLElement).getByRole('combobox')).toHaveClass('w-44')
    expect(within(readyActions as HTMLElement).getByRole('button', { name: 'Edit lesson' })).toHaveClass('w-32')
    expect(screen.getByText('Ready').parentElement).toHaveClass('w-[7.25rem]')

    for (const ownerSelect of screen.getAllByRole('combobox', { name: /^Owner for/ })) {
      expect(ownerSelect).toHaveClass('w-44')
    }
  })
})
