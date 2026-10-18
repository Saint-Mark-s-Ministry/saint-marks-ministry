import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ history: vi.fn(), mutate: vi.fn() }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolIndividualAttendance: mocks.history }))
import { SundaySchoolIndividualAttendance } from '@/components/sunday-school-individual-attendance'

describe('individual weekly attendance table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.history.mockReturnValue({ data: { dates: ['2026-10-04', '2026-10-11'], children: [
      { id: 'mary', firstName: 'Mary', lastName: 'Hanna', onRoster: true, counts: { present: 1, late: 0, absent: 0, excused: 0 }, rate: 100, attendance: { '2026-10-04': 'PRESENT' } },
      { id: 'john', firstName: 'John', lastName: 'Hanna', onRoster: false, counts: { present: 0, late: 0, absent: 0, excused: 1 }, rate: null, attendance: { '2026-10-04': 'EXCUSED' } },
    ] }, mutate: mocks.mutate })
  })
  it('shows dated marks, unrecorded cells, totals and former roster members', () => {
    render(<SundaySchoolIndividualAttendance classId="class-1" />)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByText('Former roster member')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Oct 4, 2026/ })).toBeInTheDocument()
    const row = screen.getByRole('rowheader', { name: 'Mary Hanna' }).closest('tr')!
    expect(within(row).getByText('100%')).toBeInTheDocument()
    expect(within(row).getByLabelText('Present')).toHaveTextContent('P')
    expect(within(row).getByLabelText('Unrecorded')).toHaveTextContent('—')
  })
  it('filters children by name', () => {
    render(<SundaySchoolIndividualAttendance classId="class-1" />)
    fireEvent.change(screen.getByPlaceholderText('Find a child'), { target: { value: 'mary' } })
    expect(screen.getByRole('rowheader', { name: 'Mary Hanna' })).toBeInTheDocument()
    expect(screen.queryByText('John Hanna')).not.toBeInTheDocument()
  })
  it('refreshes after saving attendance and supports error retry', () => {
    const { rerender } = render(<SundaySchoolIndividualAttendance classId="class-1" />)
    rerender(<SundaySchoolIndividualAttendance classId="class-1" savedAt="2026-10-11T16:00:00Z" />)
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    mocks.history.mockReturnValue({ error: new Error('Offline'), mutate: mocks.mutate })
    rerender(<SundaySchoolIndividualAttendance classId="class-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.mutate).toHaveBeenCalledTimes(2)
  })
})
