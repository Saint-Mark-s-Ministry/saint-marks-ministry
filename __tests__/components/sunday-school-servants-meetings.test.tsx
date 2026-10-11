import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), mutate: vi.fn(), fetch: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolMeetings: mocks.hook }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import { SundaySchoolServantsMeetings } from '@/components/sunday-school-servants-meetings'

const meeting = { id: 'meeting-1', date: '2026-01-15T00:00:00.000Z', title: 'Planning' }
const base = { meetings: [meeting], meeting: null, roster: [], canEdit: false, canCreate: false }

describe('Elementary servants meeting section', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.hook.mockReturnValue({ data: base, isLoading: false, mutate: mocks.mutate })
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: meeting.id }) })
  })

  it('shows the session list to ordinary servants without edit controls', async () => {
    mocks.hook.mockImplementation((_group, selected) => ({
      data: selected ? { ...base, meeting, roster: [{ id: 'mary', name: 'Mary', status: 'PRESENT' }] } : base,
      isLoading: false, mutate: mocks.mutate,
    }))
    render(<SundaySchoolServantsMeetings ageGroupId="elementary" />)
    expect(screen.getByText('Meeting sessions')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add meeting' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Meeting session'), { target: { value: meeting.id } })
    expect(screen.getByText('Mary')).toBeInTheDocument()
    expect(screen.getByText('Present')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save meeting attendance' })).not.toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('creates a session only after the coordinator submits Add meeting', async () => {
    mocks.hook.mockReturnValue({ data: { ...base, meetings: [], canCreate: true }, isLoading: false, mutate: mocks.mutate })
    render(<SundaySchoolServantsMeetings ageGroupId="elementary" />)
    expect(mocks.fetch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Add meeting' }))
    fireEvent.change(screen.getByLabelText('Meeting date'), { target: { value: '2026-01-15' } })
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: 'Planning' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create session' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ ageGroupId: 'elementary', date: '2026-01-15', title: 'Planning' })
  })

  it('requires explicit marks and saves them against the selected session', async () => {
    mocks.hook.mockImplementation((_group, selected) => ({
      data: { ...base, canCreate: true, canEdit: true, meeting: selected ? meeting : null,
        roster: selected ? [{ id: 'mary', name: 'Mary', status: null }] : [] },
      isLoading: false, mutate: mocks.mutate,
    }))
    render(<SundaySchoolServantsMeetings ageGroupId="elementary" />)
    fireEvent.change(screen.getByLabelText('Meeting session'), { target: { value: meeting.id } })
    expect(screen.getByRole('button', { name: 'Save meeting attendance' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Absent' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save meeting attendance' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ meetingId: meeting.id, records: [{ servantId: 'mary', status: 'ABSENT' }] })
  })

  it('can add another session while viewing a future meeting', () => {
    mocks.hook.mockReturnValue({ data: { ...base, canCreate: true, meeting: { ...meeting, date: '2099-01-01' } }, isLoading: false, mutate: mocks.mutate })
    render(<SundaySchoolServantsMeetings ageGroupId="elementary" />)
    expect(screen.getByRole('button', { name: 'Add meeting' })).toBeEnabled()
    expect(screen.getByText('Attendance opens on the meeting date.')).toBeInTheDocument()
  })
})
