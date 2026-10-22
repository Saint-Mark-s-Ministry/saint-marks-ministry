import { act, render, screen, within, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentHistory } from '@/lib/student-history'

const mocks = vi.hoisted(() => ({ history: vi.fn(), privateNotes: vi.fn(), retry: vi.fn(), chunk: null as Promise<void> | null }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'staff-1' } } }) }))
vi.mock('@/lib/swr', () => ({ useStudentHistory: mocks.history, useStudentHistoryPrivateNotes: mocks.privateNotes }))
vi.mock('next/dynamic', async () => {
  const { lazy } = await import('react')
  // Match App Router dynamic imports, including suspension before the first load.
  return { default: (loader: () => Promise<typeof import('@/components/student-history-dialog')>) => lazy(async () => {
    await mocks.chunk
    return loader()
  }) }
})

import { StudentName } from '@/components/student-history-provider'
import SundaySchoolLayout from '@/app/dashboard/servants/layout'

function history(id = 'child-1'): StudentHistory {
  return {
    id, name: 'Mina Mark', program: 'sunday-school', subtitle: 'Sunday School · Grade 5', canReadPrivateNotes: true,
    profile: {
      className: 'Grade 5', level: 'GRADE_5', birthDate: '2015-03-12', gender: 'MALE', isActive: true,
      fatherOfConfession: 'Fr. Mark', phone: '555-0100', email: 'student@example.com',
      guardian: { name: 'Guardian Mark', phone: '555-0101', email: 'guardian@example.com' },
      family: { name: 'Mark Family', homeAddress: '123 Main Street', motherName: 'Mary Mark', motherPhone: '555-0102', motherEmail: 'mother@example.com', fatherName: 'John Mark', fatherPhone: '555-0103', fatherEmail: 'father@example.com' },
    },
    attendance: { kind: 'meetings', counts: { present: 1, late: 0, absent: 0, excused: 0 }, rate: 100, records: [
      { id: 'mark-1', date: '2026-10-04', title: 'Grade 5', status: 'PRESENT', notes: null },
    ] },
    notes: { general: `Roster note for ${id}`, entries: [] },
    visitations: [{ id: 'visit-1', status: 'DONE', visitedAt: '2026-10-05', createdAt: '2026-10-06', notes: 'Family visit', recorder: { name: 'Servant One' } }],
    phoneCalls: [{ id: 'call-1', calledAt: '2026-10-07', outcome: 'CONNECTED', note: 'Spoke about attendance', callerName: 'Servant One' }],
  }
}

function Harness() {
  return <SundaySchoolLayout>
    <label>Unsaved notes<input aria-label="Unsaved notes" defaultValue="Keep this draft" /></label>
    <StudentName id="child-1" name="Mina Mark" program="sunday-school" />
    <StudentName id="child-2" name="Mina Mark" program="sunday-school" />
  </SundaySchoolLayout>
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.history.mockImplementation(target => ({ data: history(target.id), isLoading: false, isValidating: false, mutate: mocks.retry }))
  mocks.privateNotes.mockReturnValue({ data: { notes: [] }, isLoading: false, isValidating: false })
})

describe('Sunday School student history', () => {
  it('keeps the class page visible while the first click downloads the dialog', async () => {
    const user = userEvent.setup()
    let releaseChunk!: () => void
    mocks.chunk = new Promise<void>(resolve => { releaseChunk = resolve })
    render(<Suspense fallback={<p>Class page loading</p>}><Harness /></Suspense>)
    const draft = screen.getByLabelText('Unsaved notes')
    const opener = screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0]
    await user.type(draft, ' with edits')
    try {
      await user.click(opener)
      expect(screen.getByRole('status')).toHaveTextContent('Loading student profile')
      expect(screen.queryByText('Class page loading')).not.toBeInTheDocument()
      expect(draft).toBeVisible()
      expect(opener).toBeVisible()
      expect(mocks.history).not.toHaveBeenCalled()
    } finally {
      await act(async () => { releaseChunk() })
      mocks.chunk = null
    }
    expect(await screen.findByRole('dialog', { name: 'Mina Mark' })).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(screen.getByLabelText('Unsaved notes')).toBe(draft)
    expect(draft).toHaveValue('Keep this draft with edits')
    await user.click(opener)
    expect(await screen.findByRole('dialog', { name: 'Mina Mark' })).toBeVisible()
    expect(screen.queryByText('Class page loading')).not.toBeInTheDocument()
  })

  it('opens the student profile first and provides actionable student and family contacts', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('tab', { name: 'Family' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByText('March 12, 2015')).toBeInTheDocument()
    expect(within(dialog).getByText('Fr. Mark')).toBeInTheDocument()
    expect(within(dialog).getByText('student@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('Mary Mark')).toBeInTheDocument()
    expect(within(dialog).getByText('John Mark')).toBeInTheDocument()
    expect(within(dialog).getByText('Guardian Mark')).toBeInTheDocument()
    expect(within(dialog).getByText('guardian@example.com')).toBeInTheDocument()
    expect(within(dialog).getByText('123 Main Street')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: "Contact options for student's phone number (Mina Mark)" }))
    expect(screen.getByRole('menuitem', { name: 'Call' })).toHaveAttribute('href', 'tel:5550100')
  })

  it('handles missing profile contacts without inventing information', async () => {
    const user = userEvent.setup()
    const data = history()
    data.profile = { ...data.profile, birthDate: null, phone: null, email: null, family: null, guardian: { name: null, phone: null, email: null } }
    mocks.history.mockReturnValue({ data })
    render(<Harness />)
    await user.click(screen.getAllByRole('button', { name: 'View history for Mina Mark' })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('No family or guardian contact information on file.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Not provided').length).toBeGreaterThanOrEqual(3)
    expect(within(dialog).queryByRole('button', { name: /Contact options/ })).not.toBeInTheDocument()
  })

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
    expect(within(dialog).getByRole('tab', { name: 'Family' })).toHaveAttribute('aria-selected', 'true')
    expect(within(dialog).getByText('555-0100')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: 'Attendance' }))
    expect(within(dialog).getAllByText('100%').length).toBeGreaterThan(0)
    expect(mocks.history).toHaveBeenCalledWith({ id: 'child-1', name: 'Mina Mark', program: 'sunday-school' }, 'staff-1')
    await user.click(within(dialog).getByRole('tab', { name: 'Notes' }))
    expect(within(dialog).getByText('Roster note for child-1')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: 'Care' }))
    expect(within(dialog).getByText('Family visit')).toBeInTheDocument()
    expect(within(dialog).getByText('Spoke about attendance')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
    expect(screen.getByLabelText('Unsaved notes')).toHaveValue('Keep this draft')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves Sunday School students with identical names by ID', async () => {
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
    expect(screen.queryByText('555-0100')).not.toBeInTheDocument()
    expect(screen.queryByText('guardian@example.com')).not.toBeInTheDocument()
    expect(screen.queryByText('123 Main Street')).not.toBeInTheDocument()
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
