import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

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

  it('restores the selected grade after the page is reloaded', async () => {
    window.history.replaceState({ marker: 'keep' }, '', '/dashboard/servants/roster?viewAs=priest#students')
    const page = render(<RosterPage />)
    await waitFor(() => expect(screen.getByLabelText('Class')).toHaveValue('pre-k'))

    fireEvent.change(screen.getByLabelText('Class'), { target: { value: 'grade-8' } })
    expect(screen.getByLabelText('Class')).toHaveValue('grade-8')
    expect(new URLSearchParams(window.location.search).get('classId')).toBe('grade-8')
    expect(new URLSearchParams(window.location.search).get('viewAs')).toBe('priest')
    expect(window.location.hash).toBe('#students')
    expect(window.history.state).toEqual({ marker: 'keep' })

    page.unmount()
    render(<RosterPage />)
    await waitFor(() => expect(screen.getByLabelText('Class')).toHaveValue('grade-8'))
    expect(mocks.children).toHaveBeenLastCalledWith('grade-8')
  })

  it('honors a link to an accessible class', async () => {
    window.history.replaceState({}, '', '/dashboard/servants/roster?classId=grade-8')
    render(<RosterPage />)
    await waitFor(() => expect(screen.getByLabelText('Class')).toHaveValue('grade-8'))
  })

  it('falls back to an available class when the saved class is unavailable', async () => {
    window.history.replaceState({}, '', '/dashboard/servants/roster?classId=unavailable')
    render(<RosterPage />)
    await waitFor(() => expect(screen.getByLabelText('Class')).toHaveValue('pre-k'))
    expect(mocks.children).toHaveBeenLastCalledWith('pre-k')
  })
})
