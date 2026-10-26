import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ birthdays: vi.fn(), selectedClass: 'all', ageGroupScope: false, query: new URLSearchParams(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }), useSearchParams: () => mocks.query }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'servant' } } }) }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated' }) }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolBirthdays: mocks.birthdays,
  useSundaySchoolClasses: () => ({ data: [{ id: 'class-1', name: 'First class', level: 'GRADE_1' }, { id: 'class-2', name: 'Second class', level: 'GRADE_2' }] }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
}))
vi.mock('@/lib/sunday-school-viewing', () => ({ ALL_CLASSES: 'all', useViewingClassId: () => [mocks.selectedClass, vi.fn(), [{ id: 'class-1', name: 'First class' }], mocks.ageGroupScope] }))
vi.mock('@/components/student-history-provider', () => ({ StudentName: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('@/components/sunday-school-hub-tabs', () => ({ CareHubTabs: () => null }))
vi.mock('@/components/sunday-school-birthday-subscribe', () => ({ SundaySchoolBirthdaySubscribe: () => <button>Add birthdays to calendar</button> }))
vi.mock('@/components/sunday-school-birthday-actions', () => ({ SundaySchoolBirthdayActions: ({ child }: { child: { firstName: string } }) => <div role="dialog">Greeting for {child.firstName}</div> }))
import BirthdaysPage from '@/app/dashboard/servants/birthdays/page'

const mary = { id: 'mary', firstName: 'Mary', lastName: 'Mark', birthDate: '2016-10-25T00:00:00Z', classId: 'class-1', class: { id: 'class-1', name: 'First class' }, level: 'GRADE_1' }
beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = new URLSearchParams()
  mocks.selectedClass = 'all'
  mocks.ageGroupScope = false
  mocks.birthdays.mockReturnValue({ data: [mary, { ...mary, id: 'john', firstName: 'John', classId: 'class-2', class: { id: 'class-2', name: 'Second class' } }] })
})

describe('birthday calendar and list', () => {
  it('shows both classes, navigates months, and retains access to the list and message actions', () => {
    render(<BirthdaysPage />)
    // Today jumps to the runtime month; navigate to October independently of the test clock.
    const now = new Date()
    const offset = 9 - now.getMonth()
    for (let i = 0; i < Math.abs(offset); i++) fireEvent.click(screen.getByRole('button', { name: offset > 0 ? 'Next month' : 'Previous month' }))
    expect(screen.getByRole('grid')).toHaveAccessibleName(`October ${now.getFullYear()}`)
    expect(screen.getByRole('link', { name: /Mary Mark/ })).toHaveAttribute('href', expect.stringContaining('child=mary'))
    expect(screen.getByRole('link', { name: /John Mark/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getAllByRole('link', { name: 'Send birthday text' })).toHaveLength(2)
    expect(screen.getByLabelText('Birthday month')).toBeInTheDocument()
  })
  it('keeps the priest age-group scope in the monthly calendar', () => {
    mocks.ageGroupScope = true
    render(<BirthdaysPage />)
    const offset = 9 - new Date().getMonth()
    for (let i = 0; i < Math.abs(offset); i++) fireEvent.click(screen.getByRole('button', { name: offset > 0 ? 'Next month' : 'Previous month' }))
    expect(screen.getByRole('link', { name: /Mary Mark/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /John Mark/ })).not.toBeInTheDocument()
  })
  it('limits birthdays to the selected class in list view', () => {
    mocks.selectedClass = 'class-1'
    render(<BirthdaysPage />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByText('Mary Mark')).toBeInTheDocument()
    expect(screen.queryByText('John Mark')).not.toBeInTheDocument()
  })
  it('opens birthday actions from calendar subscription links', () => {
    mocks.query = new URLSearchParams('child=mary&classId=class-1')
    render(<BirthdaysPage />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Greeting for Mary')
  })
  it('does not open a requested child outside the authorized birthday response', () => {
    mocks.query = new URLSearchParams('child=unknown')
    render(<BirthdaysPage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows roster guidance for an empty list and load failures', () => {
    mocks.birthdays.mockReturnValue({ data: [] })
    const { rerender } = render(<BirthdaysPage />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByText(/Add birth dates from the Roster/)).toBeInTheDocument()
    mocks.birthdays.mockReturnValue({ error: new Error('Forbidden') })
    rerender(<BirthdaysPage />)
    expect(screen.getByText('Couldn’t load birthdays')).toBeInTheDocument()
  })
})
