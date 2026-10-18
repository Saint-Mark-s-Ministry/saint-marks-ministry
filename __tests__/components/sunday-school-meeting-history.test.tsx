import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({
  status: 'authenticated', hasAccess: true, session: { user: { id: 'priest' } },
}) }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolMeetingHistory: mocks.list,
  useSundaySchoolMeetingHistoryDetail: mocks.detail,
}))
import HistoryPage from '@/app/dashboard/servants/servant-attendance/meetings/history/page'

const summary = {
  id: 'past', date: '2025-10-19T00:00:00.000Z', title: 'Planning',
  ageGroupName: 'Archived group', academicYearName: '2025-2026',
  presentCount: 1, absentCount: 1, recordedCount: 2,
}

describe('priest meeting attendance history page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.list.mockReturnValue({ data: { meetings: [summary], nextCursor: null }, isLoading: false })
    mocks.detail.mockImplementation((_viewer, id) => ({ data: id ? {
      ...summary, attendance: [
        { id: 'former', name: 'Former servant', status: 'PRESENT' },
        { id: 'other', name: 'Other servant', status: 'ABSENT' },
      ],
    } : undefined, isLoading: false }))
  })

  it('opens past-year saved attendance and presents it read-only', () => {
    render(<HistoryPage />)
    expect(screen.getByRole('heading', { name: 'Meeting attendance history' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Archived group — 2025-2026 — Planning/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Recorded meeting'), { target: { value: 'past' } })
    expect(mocks.detail).toHaveBeenLastCalledWith('priest', 'past')
    expect(screen.getByText('Former servant')).toBeInTheDocument()
    expect(screen.getByText('Present')).toBeInTheDocument()
    expect(screen.getByText('Absent')).toBeInTheDocument()
    expect(screen.getByText('1 present · 1 absent · 2 recorded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Present|Absent|Save|Check in/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Servants meetings' })).toHaveAttribute('href', '/dashboard/servants/servant-attendance/meetings')
  })

  it('pages through older meetings and resets the selected attendance', () => {
    mocks.list.mockImplementation((_viewer, cursor) => ({
      data: { meetings: [summary], nextCursor: cursor ? null : 'older-page' }, isLoading: false,
    }))
    render(<HistoryPage />)
    fireEvent.change(screen.getByLabelText('Recorded meeting'), { target: { value: 'past' } })
    fireEvent.click(screen.getByRole('button', { name: 'Older meetings' }))
    expect(mocks.list).toHaveBeenLastCalledWith('priest', 'older-page')
    expect(screen.getByLabelText('Recorded meeting')).toHaveValue('')
    expect(screen.queryByText('Former servant')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Newer meetings' }))
    expect(mocks.list).toHaveBeenLastCalledWith('priest', undefined)
  })

  it('shows an access error without displaying cached meetings', () => {
    mocks.list.mockReturnValue({ data: { meetings: [summary] }, error: new Error('Forbidden') })
    render(<HistoryPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Access is restricted to priests and super admins')
    expect(screen.queryByLabelText('Recorded meeting')).not.toBeInTheDocument()
  })

  it('shows the empty history state', () => {
    mocks.list.mockReturnValue({ data: { meetings: [], nextCursor: null }, isLoading: false })
    render(<HistoryPage />)
    expect(screen.getByText('No recorded meeting attendance is available.')).toBeInTheDocument()
  })
})
