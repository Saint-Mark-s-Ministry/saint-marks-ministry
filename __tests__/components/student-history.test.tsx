import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentHistory } from '@/lib/student-history'

const mocks = vi.hoisted(() => ({ history: vi.fn(), privateNotes: vi.fn(), retry: vi.fn() }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'staff-1' } } }) }))
vi.mock('@/lib/swr', () => ({ useStudentHistory: mocks.history, useStudentHistoryPrivateNotes: mocks.privateNotes }))
vi.mock('next/dynamic', async () => {
  const { default: Dialog } = await import('@/components/student-history-dialog')
  return { default: () => Dialog }
})

import { StudentHistoryProvider, StudentName } from '@/components/student-history-provider'

function history(id = 'child-1'): StudentHistory {
  return {
    id, name: 'Mina Mark', program: 'sunday-school', subtitle: 'Sunday School · Grade 5', canReadPrivateNotes: true,
    attendance: { kind: 'meetings', counts: { present: 1, late: 0, absent: 0, excused: 0 }, rate: 100, records: [
      { id: 'mark-1', date: '2026-10-04', title: 'Grade 5', status: 'PRESENT', notes: null, excluded: false, notApplicable: false },
    ] },
    notes: { general: `Roster note for ${id}`, entries: [] },
    visitations: [{ id: 'visit-1', status: 'DONE', visitedAt: '2026-10-05', createdAt: '2026-10-06', notes: 'Family visit', recorder: { name: 'Servant One' } }],
    phoneCalls: [{ id: 'call-1', calledAt: '2026-10-07', outcome: 'CONNECTED', note: 'Spoke about attendance', callerName: 'Servant One' }],
  }
}

function Harness() {
  return <StudentHistoryProvider>
    <label>Unsaved notes<input aria-label="Unsaved notes" defaultValue="Keep this draft" /></label>
    <StudentName id="child-1" name="Mina Mark" program="sunday-school" />
    <StudentName id="child-2" name="Mina Mark" program="sunday-school" />
  </StudentHistoryProvider>
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.history.mockImplementation(target => ({ data: history(target.id), isLoading: false, isValidating: false, mutate: mocks.retry }))
  mocks.privateNotes.mockReturnValue({ data: { notes: [] }, isLoading: false, isValidating: false })
})

describe('shared student history', () => {
  it('shows the Prep badge in a linked Sunday School student’s details', async () => {
    const user = userEvent.setup()
    mocks.history.mockReturnValue({ data: { ...history(), isServantsPrepStudent: true, photoUrl: 'https://example.test/prep.jpg' } })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Mina Mark' })
    expect(within(dialog).getByText('SP Student')).toBeInTheDocument()
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'https://example.test/prep.jpg')
  })

  it('loads on demand, shows all three histories, and preserves the underlying draft and keyboard focus', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(mocks.history).not.toHaveBeenCalled()
    const opener = screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0]
    opener.focus()
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Mina Mark' })
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
    expect(mocks.history).toHaveBeenCalledWith({ id: 'child-1', name: 'Mina Mark', program: 'sunday-school' }, 'staff-1')
    await user.click(within(dialog).getByRole('tab', { name: 'Notes' }))
    expect(within(dialog).getByText('Roster note for child-1')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: 'Visitations' }))
    expect(within(dialog).getByText('Family visit')).toBeInTheDocument()
    expect(within(dialog).getByText('Spoke about attendance')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(screen.getByLabelText('Unsaved notes')).toHaveValue('Keep this draft')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves students with identical names by program and ID', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[1])
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('tab', { name: 'Notes' }))
    expect(within(dialog).getByText('Roster note for child-2')).toBeInTheDocument()
    expect(within(dialog).queryByText('Roster note for child-1')).not.toBeInTheDocument()
  })

  it('hides retained data on denied revalidation and provides retry', async () => {
    const user = userEvent.setup()
    mocks.history.mockReturnValue({ data: { ...history(), isServantsPrepStudent: true, photoUrl: 'https://example.test/prep.jpg' }, error: { status: 403 }, mutate: mocks.retry })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access')
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
    expect(screen.queryByText('SP Student')).not.toBeInTheDocument()
    expect(document.querySelector('img[src="https://example.test/prep.jpg"]')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.retry).toHaveBeenCalledOnce()
  })

  it('does not flash cached history while a reopened panel checks access', async () => {
    const user = userEvent.setup()
    mocks.history.mockReturnValue({ data: history(), isValidating: true })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    expect(await screen.findByRole('status')).toHaveTextContent('Loading student history')
    expect(screen.queryByText('100%')).not.toBeInTheDocument()
  })

  it('loads confidential notes separately only when the notes tab opens', async () => {
    const user = userEvent.setup()
    mocks.privateNotes.mockReturnValue({ data: { notes: [{ id: 'private-1', content: 'Restricted pastoral note', createdAt: '2026-10-05', author: { id: 'author-1', name: 'Author' } }] } })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    await screen.findByRole('dialog')
    expect(mocks.privateNotes).not.toHaveBeenCalled()
    await user.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(mocks.privateNotes).toHaveBeenCalledWith('child-1', 'staff-1')
    expect(screen.getByText('Restricted pastoral note')).toBeInTheDocument()
  })

  it('explains why Prep has no visitation records and labels N/A attendance', async () => {
    const user = userEvent.setup()
    const data = history()
    data.program = 'prep'
    data.visitations = null
    data.attendance.records[0].notApplicable = true
    mocks.history.mockReturnValue({ data })
    render(<StudentHistoryProvider><StudentName id="prep-1" name="Mina Mark" /></StudentHistoryProvider>)
    await user.click(screen.getByRole('button', { name: 'View history for Mina Mark' }))
    expect(await screen.findByText('N/A')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Visitations' }))
    expect(screen.getByText(/Servants Prep has no visitation records/)).toBeInTheDocument()
  })

  it('does not request confidential notes when the server denies that capability', async () => {
    const user = userEvent.setup()
    mocks.history.mockReturnValue({ data: { ...history(), canReadPrivateNotes: false } })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(mocks.privateNotes).not.toHaveBeenCalled()
    expect(screen.queryByText('Confidential notes')).not.toBeInTheDocument()
  })
})
