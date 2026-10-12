import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { RoleTag, UserRole } from '@prisma/client'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useContactBook: mocks.hook }))
vi.mock('next-auth/react', () => ({ useSession: mocks.session }))
import { ContactBook } from '@/components/contact-book'
import { ContactBookAccessSwitch } from '@/components/contact-book-access-switch'

const response = {
  contacts: [{ id: '1', name: 'Mariam', email: 'mariam@example.com', phone: null, role: UserRole.SERVANT, roleAssignments: [{ tag: RoleTag.SUNDAY_SCHOOL_SERVANT }], sundaySchoolServing: [{ id: 'assignment', authority: 'COORDINATOR', classId: 'grade-12', ageGroupId: null, class: { id: 'grade-12', name: 'St. Mary', level: 'GRADE_12' }, ageGroup: null }] }],
  total: 1,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'viewer' } } })
  mocks.hook.mockReturnValue({ data: response, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() })
})

describe('ContactBook', () => {
  it('shows names, contact actions, missing-phone text, and a contact count', () => {
    render(<ContactBook />)
    expect(screen.getByText('Mariam')).toBeInTheDocument()
    expect(screen.getByText('Sunday School Servant', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('12th Grade Coordinator')).toBeInTheDocument()
    expect(screen.getByText('mariam@example.com')).toBeInTheDocument()
    expect(screen.getByText('No phone number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contact options for email (Mariam)' })).toBeInTheDocument()
    expect(screen.getByText('1 contact')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search contacts' }), { target: { value: 'Mariam' } })
    expect(screen.getByText('Mariam')).toBeInTheDocument()
    expect(mocks.hook).toHaveBeenLastCalledWith('viewer')
  })

  it('combines grade and role filters and clears an empty result', () => {
    render(<ContactBook />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by grade' }), { target: { value: 'GRADE_12' } })
    expect(screen.getByText('Mariam')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: 'PARENT' } })
    expect(screen.queryByText('Mariam')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No contacts match your filters')
    expect(screen.getByText('0 of 1 contacts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Mariam')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by grade' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('')
  })

  it('switches from alphabetical to grade order and resets the ordering', () => {
    const firstGrade = { ...response.contacts[0], id: '2', name: 'Zoe', email: 'zoe@example.com',
      sundaySchoolServing: [{ ...response.contacts[0].sundaySchoolServing[0], class: { id: 'first', name: 'St. George', level: 'GRADE_1' } }] }
    mocks.hook.mockReturnValue({ data: { contacts: [response.contacts[0], firstGrade], total: 2 } })
    render(<ContactBook />)
    const names = () => screen.getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent)
    expect(names()).toEqual(['Mariam', 'Zoe'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort contacts' }), { target: { value: 'grade' } })
    expect(names()).toEqual(['Zoe', 'Mariam'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(names()).toEqual(['Mariam', 'Zoe'])
  })

  it('clears displayed contacts immediately when permission is revoked', () => {
    const { rerender } = render(<ContactBook />)
    mocks.hook.mockReturnValue({ data: response, error: { status: 403 }, isLoading: false, isValidating: false })
    rerender(<ContactBook />)
    expect(screen.getByRole('alert')).toHaveTextContent('do not have access')
    expect(screen.queryByText('mariam@example.com')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('hides cached contacts during permission revalidation', () => {
    mocks.hook.mockReturnValue({ data: response, isValidating: true })
    render(<ContactBook />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading contacts')
    expect(screen.queryByText('mariam@example.com')).not.toBeInTheDocument()
  })

  it('uses the new effective identity after View as switches', () => {
    const { rerender } = render(<ContactBook />)
    mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'target' } } })
    rerender(<ContactBook />)
    expect(mocks.hook).toHaveBeenLastCalledWith('target')
  })

  it('renders empty searches and offers retry for server errors', () => {
    mocks.hook.mockReturnValue({ data: { ...response, contacts: [], total: 0 }, isValidating: false })
    const { rerender } = render(<ContactBook />)
    expect(screen.getByRole('status')).toHaveTextContent('No contacts yet')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(screen.getByRole('status')).toHaveTextContent('No contacts match')
    const retry = vi.fn()
    mocks.hook.mockReturnValue({ error: { status: 500 }, mutate: retry })
    rerender(<ContactBook />)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    expect(screen.queryByText('mariam@example.com')).not.toBeInTheDocument()
  })
})

describe('ContactBookAccessSwitch', () => {
  it('is labelled and changes through its checkbox without submitting the form', () => {
    const onChange = vi.fn()
    render(<ContactBookAccessSwitch checked={false} onChange={onChange} />)
    const toggle = screen.getByRole('checkbox', { name: 'Allow contact book access' })
    expect(toggle).not.toBeChecked()
    expect(toggle).toHaveAttribute('type', 'checkbox')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })
  it('cannot change access in View as', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ContactBookAccessSwitch checked onChange={onChange} disabled />)
    expect(screen.getByRole('checkbox')).toBeDisabled()
    await user.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
