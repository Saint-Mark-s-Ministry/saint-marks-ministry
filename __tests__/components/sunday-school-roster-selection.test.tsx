import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  children: vi.fn(() => ({ data: [], isLoading: false, mutate: vi.fn() })),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated' }),
}))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolChildren: mocks.children,
  useSundaySchoolClasses: () => ({ data: [
    { id: 'pre-k', name: 'Pre-K 1', level: 'PRE_K', canServe: false },
    { id: 'grade-8', name: '8th Grade', level: 'GRADE_8', canServe: false },
  ] }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useSundaySchoolFamilies: () => ({ data: [], mutate: vi.fn() }),
}))
vi.mock('@/components/sunday-school-roster-import', () => ({ SundaySchoolRosterImport: () => null }))
vi.mock('@/components/sunday-school-roster-link-dialog', () => ({ SundaySchoolRosterLinkDialog: () => null }))

import RosterPage from '@/app/dashboard/servants/roster/page'

describe('roster class selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    window.history.replaceState({}, '', '/dashboard/servants/roster')
  })

  it('shows the class chosen in Viewing, and keeps it after a reload', async () => {
    window.localStorage.setItem('sunday-school.viewing', 'grade-8')
    const page = render(<RosterPage />)
    await waitFor(() => expect(mocks.children).toHaveBeenLastCalledWith('grade-8'))
    // There is one class picker, in the shell; the page does not add its own.
    expect(screen.queryByLabelText('Class')).not.toBeInTheDocument()

    page.unmount()
    render(<RosterPage />)
    await waitFor(() => expect(mocks.children).toHaveBeenLastCalledWith('grade-8'))
  })

  it('honors a link to an accessible class and makes it the new choice', async () => {
    window.history.replaceState({}, '', '/dashboard/servants/roster?classId=grade-8')
    render(<RosterPage />)
    await waitFor(() => expect(mocks.children).toHaveBeenLastCalledWith('grade-8'))
    expect(window.localStorage.getItem('sunday-school.viewing')).toBe('grade-8')
  })

  it('falls back to an available class when the linked class is unavailable', async () => {
    window.history.replaceState({}, '', '/dashboard/servants/roster?classId=unavailable')
    render(<RosterPage />)
    await waitFor(() => expect(mocks.children).toHaveBeenLastCalledWith('pre-k'))
  })

  it('opens Learn names for the shared Viewing class and closes it when that choice changes', async () => {
    window.localStorage.setItem('sunday-school.viewing', 'grade-8')
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Learn names' }))
    expect(within(screen.getByRole('dialog')).getByText(/8th Grade/)).toBeInTheDocument()

    window.localStorage.setItem('sunday-school.viewing', 'pre-k')
    fireEvent(window, new Event('storage'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Learn names' }))
    expect(within(screen.getByRole('dialog')).getByText(/Pre-K 1/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Class')).not.toBeInTheDocument()
  })
})
