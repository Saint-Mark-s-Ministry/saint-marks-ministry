import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useContactBook: mocks.hook }))
vi.mock('next-auth/react', () => ({ useSession: mocks.session }))
import { ContactBook } from '@/components/contact-book'
import { ContactBookAccessSwitch } from '@/components/contact-book-access-switch'

const response = {
  contacts: [{ id: '1', name: 'Mariam', email: 'mariam@example.com', phone: null, profileImageUrl: null, roles: ['SUNDAY_SCHOOL_COORDINATOR'], sundaySchoolServing: [{ id: 'assignment', authority: 'COORDINATOR', classId: 'grade-12', ageGroupId: null, class: { id: 'grade-12', name: 'St. Mary', level: 'GRADE_12' }, ageGroup: null }] }],
  total: 1,
}
beforeEach(() => {
  vi.clearAllMocks()
  window.sessionStorage.clear()
  mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'viewer' } } })
  mocks.hook.mockReturnValue({ data: response, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() })
})

describe('ContactBook', () => {
  afterEach(() => vi.restoreAllMocks())
  it('shows names, contact actions, missing-phone text, and a contact count', () => {
    render(<ContactBook />)
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Sunday School Coordinator', { selector: 'span' })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('12th Grade Coordinator')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('mariam@example.com')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('No phone number')).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByRole('button', { name: 'Contact options for email (Mariam)' })).toBeInTheDocument()
    expect(screen.getByText('1 contact')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search contacts' }), { target: { value: 'Mariam' } })
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    expect(mocks.hook).toHaveBeenLastCalledWith('viewer')
  })

  it('uses the users-page table columns, avatars, and compact mobile rows', () => {
    mocks.hook.mockReturnValue({ data: { ...response, contacts: [{ ...response.contacts[0], profileImageUrl: '/mariam.jpg' }] } })
    render(<ContactBook />)
    const table = screen.getByRole('table', { name: 'Contacts' })
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent))
      .toEqual(['Name', 'Email', 'Phone', 'Roles', 'Sunday School'])
    expect(screen.getAllByRole('button', { name: "View Mariam's photo" })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Mariam', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('Sunday School: 12th Grade Coordinator · St. Mary')).toBeInTheDocument()
  })

  it('distinguishes two coordinators for different classes in the same grade', () => {
    const coordinators = ['Class 1', 'Class 2'].map((name, index) => ({
      ...response.contacts[0], id: String(index), name: index ? 'Mina' : 'Mariam',
      sundaySchoolServing: [{ ...response.contacts[0].sundaySchoolServing[0],
        class: { id: `first-${index}`, name, level: 'GRADE_1' } }],
    }))
    mocks.hook.mockReturnValue({ data: { contacts: coordinators, total: 2 } })
    render(<ContactBook />)
    const table = screen.getByRole('table', { name: 'Contacts' })
    for (const [index, name] of ['Mariam', 'Mina'].entries()) {
      const row = within(table).getByRole('row', { name: new RegExp(name) })
      expect(within(row).getByText('1st Grade Coordinator')).toBeInTheDocument()
      expect(within(row).getByText(`Class ${index + 1}`)).toBeInTheDocument()
      expect(screen.getByText(`Sunday School: 1st Grade Coordinator · Class ${index + 1}`)).toBeInTheDocument()
    }
  })

  it('offers ministry roles instead of application access roles', () => {
    render(<ContactBook />)
    const roleFilter = screen.getByRole('combobox', { name: 'Filter by role' })
    expect(within(roleFilter).getByRole('option', { name: 'Sunday School Coordinator' })).toBeInTheDocument()
    expect(within(roleFilter).queryByRole('option', { name: 'Super Admin' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Legacy:/)).not.toBeInTheDocument()
    fireEvent.change(roleFilter, { target: { value: 'SUNDAY_SCHOOL_COORDINATOR' } })
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    fireEvent.change(roleFilter, { target: { value: 'SUNDAY_SCHOOL_SERVANT' } })
    expect(screen.queryByText('Mariam')).not.toBeInTheDocument()
  })

  it('combines grade and role filters and clears an empty result', () => {
    render(<ContactBook />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by grade' }), { target: { value: 'GRADE_12' } })
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: 'PARENT' } })
    expect(screen.queryByText('Mariam')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status').every(status => status.textContent === 'No contacts match your filters.')).toBe(true)
    expect(screen.getByText('0 of 1 contacts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by grade' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('')
  })

  it('switches from alphabetical to grade order and resets the ordering', () => {
    const firstGrade = { ...response.contacts[0], id: '2', name: 'Zoe', email: 'zoe@example.com',
      sundaySchoolServing: [{ ...response.contacts[0].sundaySchoolServing[0], class: { id: 'first', name: 'St. George', level: 'GRADE_1' } }] }
    mocks.hook.mockReturnValue({ data: { contacts: [response.contacts[0], firstGrade], total: 2 } })
    render(<ContactBook />)
    const names = () => within(screen.getByRole('table', { name: 'Contacts' })).getAllByRole('row').slice(1).map(row => within(row).getByText(/^(Mariam|Zoe)$/).textContent)
    expect(names()).toEqual(['Mariam', 'Zoe'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort contacts' }), { target: { value: 'grade' } })
    expect(names()).toEqual(['Zoe', 'Mariam'])
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(names()).toEqual(['Mariam', 'Zoe'])
  })

  it('restores search, role, grade, and sort after a page reload', () => {
    const { unmount } = render(<ContactBook />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Mariam' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by role' }), { target: { value: 'SUNDAY_SCHOOL_COORDINATOR' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter by grade' }), { target: { value: 'GRADE_12' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort contacts' }), { target: { value: 'grade' } })
    unmount()
    render(<ContactBook />)
    expect(screen.getByRole('searchbox')).toHaveValue('Mariam')
    expect(screen.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('SUNDAY_SCHOOL_COORDINATOR')
    expect(screen.getByRole('combobox', { name: 'Filter by grade' })).toHaveValue('GRADE_12')
    expect(screen.getByRole('combobox', { name: 'Sort contacts' })).toHaveValue('grade')
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(JSON.parse(window.sessionStorage.getItem('contact-book-filters:viewer')!))
      .toEqual({ search: '', role: '', grade: '', sort: 'name' })
  })

  it('keeps saved filters separate when switching effective identities', () => {
    const { rerender } = render(<ContactBook />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Mariam' } })
    mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'target' } } })
    rerender(<ContactBook />)
    expect(screen.getByRole('searchbox')).toHaveValue('')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Different' } })
    mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'viewer' } } })
    rerender(<ContactBook />)
    expect(screen.getByRole('searchbox')).toHaveValue('Mariam')
  })

  it.each(['{broken', JSON.stringify({ role: 'SUPER_ADMIN', grade: 'invalid', sort: 'invalid' })])('ignores invalid saved preferences: %s', saved => {
    window.sessionStorage.setItem('contact-book-filters:viewer', saved)
    render(<ContactBook />)
    expect(screen.getByRole('combobox', { name: 'Filter by role' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Filter by grade' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Sort contacts' })).toHaveValue('name')
  })

  it('still filters when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable') })
    render(<ContactBook />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Missing' } })
    expect(screen.queryByText('Mariam')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(within(screen.getByRole('table', { name: 'Contacts' })).getByText('Mariam')).toBeInTheDocument()
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
    expect(screen.getAllByRole('status').every(status => status.textContent === 'No contacts yet.')).toBe(true)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
    expect(screen.getAllByRole('status').every(status => status.textContent?.includes('No contacts match'))).toBe(true)
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
