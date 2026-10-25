import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ contact: vi.fn(), copy: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'servant' } } }) }))
vi.mock('@/lib/swr', () => ({ useBirthdayTextContact: mocks.contact }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('@/components/student-history-provider', () => ({ StudentName: ({ name }: { name: string }) => <button>{name}</button> }))
import { SundaySchoolBirthdayActions } from '@/components/sunday-school-birthday-actions'

const child = { id: 'child-1', firstName: 'Mary', lastName: 'Mark' }
const renderActions = () => render(<SundaySchoolBirthdayActions child={child} onClose={vi.fn()} />)
beforeEach(() => {
  vi.clearAllMocks()
  mocks.contact.mockReturnValue({ data: { cellPhone: '+1 555 123 4567' }, isLoading: false, isValidating: false })
  mocks.copy.mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.copy } })
})

describe('birthday text actions', () => {
  it('loads only the selected child, fills their name and permits editing before opening SMS', () => {
    renderActions()
    expect(mocks.contact).toHaveBeenCalledWith('child-1', 'servant')
    expect(screen.getByRole('textbox')).toHaveValue('Happy birthday, Mary! May God bless you and grant you a joyful year ahead! 🎉')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Happy birthday, Mary & Mark!' } })
    expect(screen.getByRole('link', { name: 'Send birthday text' })).toHaveAttribute('href', 'sms:+15551234567?body=Happy%20birthday%2C%20Mary%20%26%20Mark!')
  })
  it('copies the edited draft without sending a message', async () => {
    renderActions()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'God bless you, Mary!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(mocks.copy).toHaveBeenCalledWith('God bless you, Mary!'))
  })
  it.each([null, '', 'unknown'])('offers copy without substituting a guardian for an unusable number: %s', phone => {
    mocks.contact.mockReturnValue({ data: { cellPhone: phone, guardianPhone: '5559999999' } })
    renderActions()
    expect(screen.queryByRole('link', { name: 'Send birthday text' })).not.toBeInTheDocument()
    expect(screen.getByText(/No usable child phone/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeEnabled()
  })
  it('hides cached contact while rechecking permission or after denial', () => {
    mocks.contact.mockReturnValue({ data: { cellPhone: '5551234567' }, isValidating: true })
    const { rerender } = renderActions()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    mocks.contact.mockReturnValue({ data: { cellPhone: '5551234567' }, error: new Error('Forbidden') })
    rerender(<SundaySchoolBirthdayActions child={child} onClose={vi.fn()} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
  })
  it('reports clipboard failure and preserves the editable greeting', async () => {
    mocks.copy.mockRejectedValue(new Error('clipboard unavailable'))
    renderActions()
    fireEvent.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalled())
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('Mary')
  })
})
