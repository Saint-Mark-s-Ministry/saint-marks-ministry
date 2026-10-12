import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  data: {} as Record<string, unknown>,
  error: undefined as Error | undefined,
  mutate: vi.fn(),
}))
vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => ({
    status: 'authenticated',
    session: { user: { id: 'async-student', isAsyncStudent: true } },
  }),
}))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolLessons: () => ({ data: mocks.data, error: mocks.error, isLoading: false, mutate: mocks.mutate }),
  useSundaySchoolHomework: () => ({ data: undefined }),
}))
import ClassLessonsPage from '@/app/dashboard/student/class-lessons/page'

const cls = { id: 'kindergarten-2', name: 'Kindergarten - 2', level: 'KINDERGARTEN' }

describe('Async student class lessons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.error = undefined
    mocks.data = { classes: [cls], lessons: [] }
  })

  it('shows the assigned serving class even if it has no upcoming lessons', () => {
    render(<ClassLessonsPage />)
    expect(screen.getByText('Your serving class')).toBeInTheDocument()
    expect(screen.getByText('Kindergarten - 2')).toBeInTheDocument()
    expect(screen.getByText('No upcoming class lessons')).toBeInTheDocument()
    expect(screen.queryByText(/child record/i)).not.toBeInTheDocument()
  })

  it('shows the serving class lesson and its resources', () => {
    mocks.data.lessons = [{
      id: 'lesson-1', class: cls, sundayDate: '2026-10-18T00:00:00Z',
      title: 'The Good Shepherd', status: 'READY',
      resources: [{ id: 'slides-1', title: 'Slides', url: 'https://example.com/slides' }],
    }]
    render(<ClassLessonsPage />)
    expect(screen.getByText('The Good Shepherd')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Slides/ })).toHaveAttribute('href', 'https://example.com/slides')
    expect(screen.queryByText('No upcoming class lessons')).not.toBeInTheDocument()
  })

  it('explains that an explicit serving class is needed when none is assigned', () => {
    mocks.data = { classes: [], lessons: [] }
    render(<ClassLessonsPage />)
    expect(screen.getByText('No serving class assigned')).toBeInTheDocument()
    expect(screen.getByText(/link your active serving assignment/)).toBeInTheDocument()
  })

  it('offers retry after a load error rather than claiming no serving assignment exists', () => {
    mocks.error = new Error('Server error')
    render(<ClassLessonsPage />)
    expect(screen.getByText('Could not load class lessons')).toBeInTheDocument()
    expect(screen.queryByText('No serving class assigned')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })
})
