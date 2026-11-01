import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Synthetic identities only; deliberately different first/last-name orders.
const mocks = vi.hoisted(() => {
  const children = [
    { id: 'z', firstName: 'Zoe', lastName: 'Adams' },
    { id: 'b', firstName: 'Alex', lastName: 'Brown' },
    { id: 'a', firstName: 'Alex', lastName: 'Able' },
  ].map(child => ({ ...child, level: 'GRADE_1', isActive: true, visitations: [], phoneCalls: [], visitationPriority: child.id !== 'z' }))
  const classroom = { id: 'class', name: 'Synthetic class', level: 'GRADE_1', canServe: false, canEdit: false, children }
  return { children, classroom }
})

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/servants/visitations',
}))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated' }) }))
vi.mock('@/lib/sunday-school-viewing', () => ({ useViewingClassId: () => ['class'] }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolChildren: () => ({ data: mocks.children, mutate: vi.fn() }),
  useSundaySchoolClasses: () => ({ data: [mocks.classroom] }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useSundaySchoolFamilies: () => ({ data: [] }),
  useSundaySchoolVisitations: () => ({ data: { standing: { readOnly: true }, classes: [mocks.classroom] }, mutate: vi.fn() }),
}))
vi.mock('@/components/sunday-school-roster-import', () => ({ SundaySchoolRosterImport: () => null }))
vi.mock('@/components/sunday-school-roster-link-dialog', () => ({ SundaySchoolRosterLinkDialog: () => null }))

import RosterPage from '@/app/dashboard/servants/roster/page'
import VisitationsPage from '@/app/dashboard/servants/visitations/page'

const names = () => screen.queryAllByRole('button', { name: /^View history for/ }).map(button => button.textContent)

beforeEach(() => { vi.clearAllMocks() })

describe.each([
  { title: 'roster', Page: RosterPage, searchLabel: 'Search by name' },
  { title: 'visitations', Page: VisitationsPage, searchLabel: 'Find a child' },
])('$title name sorting', ({ Page, searchLabel }) => {
  it('allows read-only viewers to switch name order and search without mutating cached data', () => {
    render(<Page />)
    const select = screen.getByRole('combobox', { name: 'Alphabetize by' })
    // Do not hide the selector at mobile breakpoints (the original roster bug).
    expect(select.className).not.toMatch(/hidden/)
    expect(names()).toEqual(['Alex Able', 'Zoe Adams', 'Alex Brown'])
    fireEvent.change(select, { target: { value: 'first' } })
    expect(names()).toEqual(['Alex Able', 'Alex Brown', 'Zoe Adams'])
    fireEvent.change(screen.getByRole('searchbox', { name: searchLabel }), { target: { value: 'Alex' } })
    expect(names()).toEqual(['Alex Able', 'Alex Brown'])
    expect(mocks.children.map(child => child.id)).toEqual(['z', 'b', 'a'])
    fireEvent.change(screen.getByRole('searchbox', { name: searchLabel }), { target: { value: '' } })
    fireEvent.change(select, { target: { value: 'last' } })
    expect(names()).toEqual(['Alex Able', 'Zoe Adams', 'Alex Brown'])
  })
})

it('preserves visitation priority filters when sorting by first name', () => {
  render(<VisitationsPage />)
  fireEvent.change(screen.getByRole('combobox', { name: 'Alphabetize by' }), { target: { value: 'first' } })
  fireEvent.click(screen.getByRole('button', { name: /Priority visits/ }))
  expect(names()).toEqual(['Alex Able', 'Alex Brown'])
})
