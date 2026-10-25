import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { HomeworkRecordDialog } from '@/components/sunday-school-homework-record'

const week = {
  weeklyLessonId: 'lesson-1',
  assignedDate: '2026-10-17T00:00:00.000Z',
  dueDate: '2026-10-24T00:00:00.000Z',
  class: { id: 'class-1', name: 'Grade 3', level: 'GRADE_3' },
  homework: {
    id: 'hw-1', title: 'Memory verse', instructions: null, archivedAt: null, resources: [],
    completions: [{ childId: 'a', child: { id: 'a', firstName: 'Anna', lastName: 'G' }, status: 'COMPLETED', updatedAt: '2026-10-20T00:00:00.000Z' }],
    summary: { completed: 1, notCompleted: 0, notRecorded: 1, completionRate: 100 },
  },
} as never
const roster = [{ id: 'a', firstName: 'Anna', lastName: 'G' }, { id: 'b', firstName: 'Ben', lastName: 'H' }]

afterEach(() => vi.unstubAllGlobals())

describe('HomeworkRecordDialog', () => {
  it('starts from saved marks and sends only the children whose mark changed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    const onSaved = vi.fn()
    render(<HomeworkRecordDialog week={week} roster={roster} onSaved={onSaved} />)

    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(screen.getByRole('button', { name: 'Anna G did it' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ben H did not do it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/sunday-school/homework/hw-1/completions', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ records: [{ childId: 'b', status: 'NOT_COMPLETED' }] })
  })

  it('clears a mark when tapped again', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<HomeworkRecordDialog week={week} roster={roster} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anna G did it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ records: [{ childId: 'a', status: null }] })
  })
})
