import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  data: { className: 'Synthetic class', date: '2026-11-14', opensAt: '2026-11-14T15:30:00Z', expiresAt: '2026-11-14T17:30:00Z', state: 'open' },
  error: null as Error | null, fetch: vi.fn(),
}))
vi.mock('@/lib/swr', () => ({ usePublicAttendanceCheckIn: () => ({ data: mocks.data, error: mocks.error, isLoading: false, mutate: vi.fn() }) }))
import AttendanceCheckInPage from '@/app/attendance-check-in/page'
beforeEach(() => {
  window.history.replaceState({}, '', '/attendance-check-in#token=synthetic-code')
  mocks.error = null; mocks.data.state = 'open'; mocks.fetch.mockReset(); vi.stubGlobal('fetch', mocks.fetch)
})
describe('child-facing name check-in', () => {
  it('offers name entry without sign-in or roster selection', async () => {
    render(<AttendanceCheckInPage />)
    expect(await screen.findByLabelText('Your full name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'I’m here' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument()
  })
  it('sends the typed name and waits for servant confirmation without claiming attendance was marked', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ received: true }) })
    render(<AttendanceCheckInPage />)
    fireEvent.change(await screen.findByLabelText('Your full name'), { target: { value: 'Synthetic Child' } })
    fireEvent.click(screen.getByRole('button', { name: 'I’m here' }))
    expect(await screen.findByRole('status')).toHaveTextContent('finish checking you in')
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ token: 'synthetic-code', name: 'Synthetic Child' })
    expect(screen.queryByText(/You’re checked in!/)).not.toBeInTheDocument()
  })
  it('shows errors without claiming success', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Check-in is closed.' }) })
    render(<AttendanceCheckInPage />)
    fireEvent.change(await screen.findByLabelText('Your full name'), { target: { value: 'Synthetic Child' } })
    fireEvent.click(screen.getByRole('button', { name: 'I’m here' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check-in is closed.')
  })
  it.each(['upcoming', 'closed'])('does not accept names when the window is %s', async state => {
    mocks.data.state = state; render(<AttendanceCheckInPage />)
    expect(await screen.findByRole('status')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I’m here' })).not.toBeInTheDocument()
  })
})
