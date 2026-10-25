import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolRosterContactForm } from '@/components/sunday-school-roster-contact-form'

const fetchMock = vi.fn()
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', fetchMock) })

describe('class contact form', () => {
  it('shows one class with no roster search or grade selector and requires identity and a phone', () => {
    render(<SundaySchoolRosterContactForm token="secret" className="10th Grade A" levelLabel="Grade 10" />)
    expect(screen.getByText('10th Grade A · Grade 10')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Date of birth/)).toBeRequired()
    expect(screen.getByRole('button', { name: 'Submit phone details' })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends only the entered identity, phones and token, then clears the submitted details', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    render(<SundaySchoolRosterContactForm token="secret" className="10th Grade A" levelLabel="Grade 10" />)
    await userEvent.type(screen.getByLabelText(/First name/), 'Mina')
    await userEvent.type(screen.getByLabelText(/Last name/), 'Botros')
    await userEvent.type(screen.getByLabelText(/Date of birth/), '2011-04-12')
    await userEvent.type(screen.getByLabelText('Your phone number'), '2015550123')
    await userEvent.click(screen.getByRole('button', { name: 'Submit phone details' }))
    await screen.findByText('Thank you')
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/public/roster-signup')
    expect(JSON.parse(options.body)).toEqual({ token: 'secret', firstName: 'Mina', lastName: 'Botros', birthDate: '2011-04-12', cellPhone: '2015550123', guardianPhone: '' })
    expect(screen.getByRole('status')).toHaveTextContent('If your name and birth date match')
    expect(screen.getByRole('status')).toHaveTextContent('Ask a servant')
    expect(screen.queryByDisplayValue('2015550123')).not.toBeInTheDocument()
  })

  it('keeps the form available after a rejected or rate-limited submission', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'Too many attempts. Ask a servant.' }) })
    render(<SundaySchoolRosterContactForm token="secret" className="10th Grade A" levelLabel="Grade 10" />)
    await userEvent.type(screen.getByLabelText(/First name/), 'Mina')
    await userEvent.type(screen.getByLabelText(/Last name/), 'Botros')
    await userEvent.type(screen.getByLabelText(/Date of birth/), '2011-04-12')
    await userEvent.type(screen.getByLabelText('Parent or guardian’s phone number'), '2015550199')
    await userEvent.click(screen.getByRole('button', { name: 'Submit phone details' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit phone details' })).toBeEnabled())
    expect(screen.queryByText('Thank you')).not.toBeInTheDocument()
  })
})
