import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ActivityPage from '@/app/dashboard/admin/activity/page'

const event = {
  id: 'evt-1',
  action: 'auth.login',
  entityType: 'User',
  entityId: 'user-123',
  result: 'DENIED',
  reason: null,
  metadata: null,
  createdAt: '2026-09-28T18:40:00.000Z',
  actor: { id: 'u1', name: 'Mina Servant', email: 'mina@example.com' },
  target: null,
}

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ events: [event], page: 1, total: 1, totalPages: 1, retention: { hours: 72, maxEvents: 5000 } }),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('Activity log', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists events with a worded result', async () => {
    stubFetch()
    render(<ActivityPage />)
    const row = await screen.findByRole('button', { name: /Mina Servant/ })
    expect(within(row).getByText('Denied')).toBeInTheDocument()
    expect(screen.getByText(/1 event · kept up to 72 hours/)).toBeInTheDocument()
  })

  it('refetches with the chosen result filter', async () => {
    const fetchMock = stubFetch()
    render(<ActivityPage />)
    await screen.findByRole('button', { name: /Mina Servant/ })
    await userEvent.click(screen.getByRole('button', { name: 'Failed' }))
    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining('result=FAILED')))
  })

  it('opens an event’s details beside the list', async () => {
    stubFetch()
    render(<ActivityPage />)
    await userEvent.click(await screen.findByRole('button', { name: /Mina Servant/ }))
    expect(await screen.findByText('Record ID')).toBeInTheDocument()
    expect(screen.getByText('user-123')).toBeInTheDocument()
  })
  it('shows who saved attendance and opens the bundled save details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
      events: [{ ...event, action: 'attendance.sunday_school_children.save', result: 'SUCCESS',
        entityType: 'SundaySchoolSession', entityId: 'session-1', metadata: {
          targetName: 'Grade 3', attendanceDate: '2026-09-28', personCount: 12, saveCount: 4,
          firstSavedAt: '2026-09-28T18:35:00.000Z', lastSavedAt: event.createdAt,
        } }], page: 1, total: 1, totalPages: 1, retention: { hours: 2, maxEvents: 50000 },
    }) })))
    render(<ActivityPage />)
    const row = await screen.findByRole('button', { name: /Mina Servant/ })
    expect(within(row).getByText('Saved Sunday School children’s attendance for 12 people')).toBeInTheDocument()
    expect(within(row).getByText(/Grade 3 · 2026-09-28/)).toBeInTheDocument()
    await userEvent.click(row)
    expect(screen.getByText('First saved')).toBeInTheDocument()
    expect(screen.getByText('Saves bundled')).toBeInTheDocument()
  })

})
