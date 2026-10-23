import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolCheckInPanel } from '@/components/sunday-school-check-in-panel'
import type { SundaySchoolCheckIns } from '@/types/sunday-school-check-ins'

const mocks = vi.hoisted(() => ({ hook: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolCheckIns: mocks.hook }))
vi.mock('@/components/sunday-school-call-dialog', () => ({ CALL_OUTCOME_LABELS: { NO_ANSWER: 'No answer' }, SundaySchoolCallDialog: ({ child }: { child: { name: string } }) => <div role="dialog">Calls for {child.name}</div> }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
const fixture = (): SundaySchoolCheckIns => ({
  viewerId: 'me', weekOf: '2026-10-19', classes: [{
    id: 'c1', name: 'Grade 1', canAssign: true,
    servants: [{ assignmentId: 'a1', userId: 'me', name: 'Servant One' }],
    children: [
      { id: 'kid1', firstName: 'Mary', lastName: 'Mina', assignmentId: 'a1', assignee: { id: 'me', name: 'Servant One' }, callThisWeek: { calledAt: '2026-10-22', outcome: 'NO_ANSWER' } },
      { id: 'kid2', firstName: 'Mark', lastName: 'George', assignmentId: null, assignee: null, callThisWeek: null },
    ],
  }],
})

describe('assigned check-ins panel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hook.mockReturnValue({ data: fixture(), mutate: mocks.mutate, isLoading: false })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })

  it('shows call attempts and filters mine, unassigned and not called', () => {
    render(<SundaySchoolCheckInPanel classId="c1" />)
    expect(mocks.hook).toHaveBeenCalledWith('c1')
    expect(screen.getByText('Called this week')).toBeInTheDocument()
    expect(screen.getByText(/No answer/)).toBeInTheDocument()
    expect(screen.getByText('No call logged this week')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mine/ }))
    expect(screen.getByText('Mary Mina')).toBeInTheDocument()
    expect(screen.queryByText('Mark George')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Unassigned/ }))
    expect(screen.queryByText('Mary Mina')).not.toBeInTheDocument()
    expect(screen.getByText('Mark George')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Not called this week/ }))
    expect(screen.getByText('Mark George')).toBeInTheDocument()
    expect(screen.queryByText('Mary Mina')).not.toBeInTheDocument()
  })

  it('assigns and clears without writing a call record', async () => {
    render(<SundaySchoolCheckInPanel />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Check-in servant for Mark George' }), { target: { value: 'a1' } })
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/sunday-school/follow-up-assignments', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ childId: 'kid2', assignmentId: 'a1' }) }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Check-in servant for Mary Mina' })).toBeEnabled())
    fireEvent.change(screen.getByRole('combobox', { name: 'Check-in servant for Mary Mina' }), { target: { value: '' } })
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith('/api/sunday-school/follow-up-assignments', expect.objectContaining({ body: JSON.stringify({ childId: 'kid1', assignmentId: null }) })))
    fireEvent.click(screen.getAllByRole('button', { name: 'Log call' })[0])
    expect(screen.getByRole('dialog')).toHaveTextContent('Calls for Mary Mina')
    expect(screen.getByRole('button', { name: 'View history for Mary Mina' })).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('keeps the saved selection and reports a failed update', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'The roster changed' }) } as Response)
    render(<SundaySchoolCheckInPanel />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Check-in servant for Mary Mina' }), { target: { value: '' } })
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('The roster changed'))
    expect(screen.getByRole('combobox', { name: 'Check-in servant for Mary Mina' })).toHaveValue('a1')
  })

  it('shows read-only responsibility and call history without an assignment picker', () => {
    const data = fixture()
    data.classes[0].canAssign = false
    mocks.hook.mockReturnValue({ data, mutate: mocks.mutate })
    render(<SundaySchoolCheckInPanel />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Servant One')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Call history' })).toHaveLength(2)
  })

  it('hides cached children when permission revalidation fails', () => {
    mocks.hook.mockReturnValue({ data: fixture(), error: new Error('Forbidden'), mutate: mocks.mutate })
    render(<SundaySchoolCheckInPanel />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load check-in assignments')
    expect(screen.queryByText('Mary Mina')).not.toBeInTheDocument()
  })
})
