import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SundaySchoolCareEditor } from '@/components/sunday-school-care-editor'

vi.mock('swr', () => ({ mutate: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })))

describe('shared calls and visits editor', () => {
  it('records a completed visit and optional confidential note in the existing visitation flow', async () => {
    const saved = vi.fn()
    render(<SundaySchoolCareEditor childId="child-1" onSaved={saved} />)
    fireEvent.click(screen.getByRole('button', { name: /^Visit$/ }))
    fireEvent.change(screen.getByLabelText('Date visited'), { target: { value: '2026-10-22' } })
    fireEvent.change(screen.getByLabelText('Visit notes (optional)'), { target: { value: 'Shared visit summary' } })
    fireEvent.change(screen.getByLabelText('Private note to priests (optional)'), { target: { value: 'Confidential fixture' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }))
    await waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(fetch).toHaveBeenCalledWith('/api/sunday-school/visitations', expect.objectContaining({ body: JSON.stringify({ childId: 'child-1', status: 'DONE', visitedAt: '2026-10-22', notes: 'Shared visit summary', privateNote: 'Confidential fixture' }) }))
    expect(screen.getByLabelText('Private note to priests (optional)')).toHaveValue('')
  })

  it('allows a not-done visit without inventing a completion date', async () => {
    render(<SundaySchoolCareEditor childId="child-1" onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Visit$/ }))
    fireEvent.change(screen.getByLabelText('Visit status'), { target: { value: 'NOT_DONE' } })
    expect(screen.queryByLabelText('Date visited')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith('/api/sunday-school/visitations', expect.objectContaining({ body: JSON.stringify({ childId: 'child-1', status: 'NOT_DONE', visitedAt: null, notes: '', privateNote: '' }) }))
  })
})
