import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), session: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useContactBook: mocks.hook }))
vi.mock('next-auth/react', () => ({ useSession: mocks.session }))
import { ContactBook } from '@/components/contact-book'
import { ContactBookAccessSwitch } from '@/components/contact-book-access-switch'

const response = {
  contacts: [{ id: '1', name: 'Mariam', email: 'mariam@example.com', phone: null }],
  total: 51, page: 1, pageSize: 50,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'viewer' } } })
  mocks.hook.mockReturnValue({ data: response, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() })
})

describe('ContactBook', () => {
  it('shows names, contact actions, missing-phone text, and pagination', () => {
    render(<ContactBook />)
    expect(screen.getByText('Mariam')).toBeInTheDocument()
    expect(screen.getByText('mariam@example.com')).toBeInTheDocument()
    expect(screen.getByText('No phone number')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contact options for email (Mariam)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(mocks.hook).toHaveBeenLastCalledWith('viewer', '', 2)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search contacts' }), { target: { value: 'Mariam' } })
    expect(mocks.hook).toHaveBeenLastCalledWith('viewer', 'Mariam', 1)
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
    expect(mocks.hook).toHaveBeenLastCalledWith('target', '', 1)
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
