import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolCallDialog } from '@/components/sunday-school-call-dialog'

const mocks = vi.hoisted(() => ({ history: vi.fn(), mutate: vi.fn(), cache: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useStudentHistory: mocks.history }))
vi.mock('swr', () => ({ mutate: mocks.cache }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
const child = { id: 'kid1', name: 'Mary Mina', canEdit: true }

describe('call dialog on Care', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.history.mockReturnValue({ data: { phoneCalls: [{ id: 'call1', calledAt: '2026-10-20', outcome: 'NO_ANSWER', note: 'Try tomorrow', callerName: 'Servant One' }] }, mutate: mocks.mutate })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
  })

  it('loads the selected child’s history and saves a call without navigation', async () => {
    const onSaved = vi.fn()
    render(<SundaySchoolCallDialog child={child} viewerId="me" onClose={vi.fn()} onSaved={onSaved} />)
    expect(screen.getByRole('dialog')).toHaveTextContent('Calls · Mary Mina')
    expect(mocks.history).toHaveBeenCalledWith({ id: 'kid1', name: 'Mary Mina', program: 'sunday-school' }, 'me')
    expect(screen.getByText('Try tomorrow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save call' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Date called'), { target: { value: '2026-10-22' } })
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'LEFT_VOICEMAIL' } })
    fireEvent.change(screen.getByLabelText('Call note'), { target: { value: 'Asked the family to call back' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save call' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/sunday-school/phone-calls', expect.objectContaining({ body: JSON.stringify({ childId: 'kid1', calledAt: '2026-10-22', outcome: 'LEFT_VOICEMAIL', note: 'Asked the family to call back' }) }))
    expect(mocks.mutate).toHaveBeenCalledOnce()
    expect(mocks.cache).toHaveBeenCalledWith('/api/sunday-school/visitations?view=follow-up')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('Call note')).toHaveValue('')
  })

  it('preserves an unsaved note and shows server validation errors', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) } as Response)
    const onSaved = vi.fn()
    render(<SundaySchoolCallDialog child={child} viewerId="me" onClose={vi.fn()} onSaved={onSaved} />)
    fireEvent.change(screen.getByLabelText('Call note'), { target: { value: 'My unsaved note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save call' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Forbidden'))
    expect(screen.getByLabelText('Call note')).toHaveValue('My unsaved note')
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('allows read-only history without a call form', () => {
    render(<SundaySchoolCallDialog child={{ ...child, canEdit: false }} viewerId="priest" onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByLabelText('Call note')).not.toBeInTheDocument()
    expect(screen.getByText('Try tomorrow')).toBeInTheDocument()
  })

  it('hides stale history and the form after permission denial', () => {
    mocks.history.mockReturnValue({ data: { phoneCalls: [{ note: 'Sensitive old note' }] }, error: new Error('Forbidden') })
    render(<SundaySchoolCallDialog child={child} viewerId="me" onClose={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load')
    expect(screen.queryByText('Sensitive old note')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Call note')).not.toBeInTheDocument()
  })
})
