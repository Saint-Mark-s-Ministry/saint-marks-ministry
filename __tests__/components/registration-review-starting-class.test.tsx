import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'admin-1', role: 'SUPER_ADMIN' } },
  submissions: [] as Array<Record<string, unknown>>,
  mutate: vi.fn(),
  fetch: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }))

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: mocks.session, status: 'authenticated' }) }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ session: mocks.session, status: 'authenticated' }) }))
vi.mock('@/lib/swr', () => ({
  useRegistrationSubmissions: () => ({ data: { submissions: mocks.submissions }, mutate: mocks.mutate }),
  useInviteCodes: () => ({ data: [], mutate: vi.fn() }),
  useRegistrationSettings: () => ({ data: { registrationEnabled: true }, mutate: vi.fn() }),
}))

import { toast } from 'sonner'
import RegistrationsPage from '@/app/dashboard/admin/registrations/page'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.submissions = [{
    id: 'registration-1', status: 'PENDING', fullName: 'Mina Mark', email: 'mina@example.com', phone: '555-0100',
    dateOfBirth: '2007-01-01', createdAt: '2026-10-01', grade: 'COLLEGE_FRESHMAN', createdUser: null,
  }]
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ linkedExistingUser: false, tempPassword: null }) })
  vi.stubGlobal('fetch', mocks.fetch)
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
})
afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  Reflect.deleteProperty(Element.prototype, 'hasPointerCapture')
})

describe('SP registration starting class', () => {
  it.each([
    { choice: 'Year 1', yearLevel: 'YEAR_1', isAsyncStudent: false },
    { choice: 'Year 2', yearLevel: 'YEAR_2', isAsyncStudent: false },
    { choice: 'Async', yearLevel: null, isAsyncStudent: true },
  ])('approves a new registration with $choice', async ({ choice, yearLevel, isAsyncStudent }) => {
    const user = userEvent.setup()
    render(<RegistrationsPage />)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    const startingClass = screen.getByRole('combobox', { name: 'Starting class' })
    expect(startingClass).toHaveTextContent('Year 1')
    if (choice !== 'Year 1') {
      await user.click(startingClass)
      await user.click(screen.getByRole('option', { name: choice }))
      expect(startingClass).toHaveTextContent(choice)
    }
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/registration/submissions/registration-1/review',
      expect.objectContaining({ method: 'POST' }),
    ))
    const payload = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(payload).toMatchObject({ action: 'approve', yearLevel, isAsyncStudent })
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it.each([
    { choice: 'Year 1', yearLevel: 'YEAR_1', isAsyncStudent: false },
    { choice: 'Year 2', yearLevel: 'YEAR_2', isAsyncStudent: false },
    { choice: 'Async', yearLevel: null, isAsyncStudent: true },
  ])('confirms the old account and $choice class before replacing a duplicate', async ({ choice, yearLevel, isAsyncStudent }) => {
    mocks.submissions[0].exactNameMatches = [{ id: 'old-student', name: 'Mina Mark', email: 'old@example.com', isDisabled: false }]
    const user = userEvent.setup()
    render(<RegistrationsPage />)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Approve this account and delete old account' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('old@example.com')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('mina@example.com')
    expect(screen.getByRole('alertdialog')).toHaveTextContent('deleted, not transferred')
    expect(mocks.fetch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.fetch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Approve this account and delete old account' }))
    const confirmationClass = screen.getByRole('combobox', { name: 'Confirm starting class' })
    expect(confirmationClass).toHaveTextContent('Year 1')
    if (choice !== 'Year 1') {
      await user.click(confirmationClass)
      await user.click(screen.getByRole('option', { name: choice }))
    }
    expect(confirmationClass).toHaveTextContent(choice)
    await user.click(screen.getByRole('button', { name: 'Approve and delete old account' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledOnce())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      action: 'approve', replaceUserId: 'old-student', yearLevel, isAsyncStudent,
    })
  })

  it.each([
    { status: 'linked', method: 'success' as const, message: 'Sunday School student roster matched automatically' },
    { status: 'review', method: 'warning' as const, message: 'Sunday School roster match needs review' },
  ])('shows the automatic matching $status result after approving', async ({ status, method, message }) => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ sundaySchoolMatch: { status, reason: 'Birth dates differ' } }) })
    const user = userEvent.setup()
    render(<RegistrationsPage />)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    await user.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(toast[method]).toHaveBeenCalledWith(...(status === 'review' ? [message, { description: 'Birth dates differ' }] : [message])))
    expect(mocks.mutate).toHaveBeenCalledOnce()
  })

  it('keeps existing applicants’ enrollment choices out of the starting-class form', async () => {
    mocks.submissions[0].createdUser = { id: 'student-1', name: 'Mina Mark', email: 'mina@example.com' }
    const user = userEvent.setup()
    render(<RegistrationsPage />)
    await user.click(screen.getByRole('button', { name: 'Review' }))
    expect(screen.queryByRole('combobox', { name: 'Starting class' })).not.toBeInTheDocument()
    expect(screen.getByText(/their year level is kept/)).toBeInTheDocument()
  })
})
