import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), mutate: vi.fn() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('classId=class-synthetic') }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated' }) }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolChildren: () => ({ data: [
    { id: 'child-1', firstName: 'Synthetic', lastName: 'One', level: 'GRADE_1', classId: 'class-synthetic', isActive: true, attendsOtherChurch: true, otherChurchName: 'Synthetic Church' },
    { id: 'child-2', firstName: 'Synthetic', lastName: 'Two', level: 'GRADE_1', classId: 'class-synthetic', isActive: true, attendsOtherChurch: false },
  ], isLoading: false, mutate: mocks.mutate }),
  useSundaySchoolClasses: () => ({ data: [{ id: 'class-synthetic', name: 'Synthetic Class', level: 'GRADE_1', canServe: true, canCoordinate: false }] }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useSundaySchoolFamilies: () => ({ data: [], mutate: vi.fn() }),
}))
vi.mock('@/components/sunday-school-roster-import', () => ({ SundaySchoolRosterImport: () => null }))
vi.mock('@/components/sunday-school-roster-link-dialog', () => ({ SundaySchoolRosterLinkDialog: () => null }))
vi.mock('@/components/sunday-school-child-photo', () => ({ ChildPhotoField: () => null }))
import RosterPage from '@/app/dashboard/servants/roster/page'

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) })
  vi.stubGlobal('fetch', mocks.fetch)
})

describe('other church roster controls', () => {
  it('shows the church and filters without dropping the name search', async () => {
    render(<RosterPage />)
    expect(await screen.findByText('Attends another church: Synthetic Church')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Attends another church' }))
    expect(screen.getByRole('button', { name: 'View history for Synthetic One' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View history for Synthetic Two' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search by name'), { target: { value: 'Two' } })
    expect(screen.getByText('No children match.')).toBeInTheDocument()
  })
  it('loads saved details, saves a correction, and allows clearing the marker', async () => {
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Synthetic One' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('checkbox', { name: 'Attends another church' })).toBeChecked()
    expect(dialog.getByLabelText('Other church name (optional)')).toHaveValue('Synthetic Church')
    fireEvent.change(dialog.getByLabelText('Other church name (optional)'), { target: { value: 'Corrected Church' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ attendsOtherChurch: true, otherChurchName: 'Corrected Church' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Edit Synthetic One' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Attends another church' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2))
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toMatchObject({ attendsOtherChurch: false, otherChurchName: '' })
  })
  it('can add a child whose other church name is not yet known', async () => {
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Add child' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('First name'), { target: { value: 'Synthetic' } })
    fireEvent.change(dialog.getByLabelText('Last name'), { target: { value: 'New' } })
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Attends another church' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Add child' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    expect(mocks.fetch.mock.calls[0][1].method).toBe('POST')
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ attendsOtherChurch: true, otherChurchName: '', classId: 'class-synthetic' })
  })
})
