import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  role: 'SUPER_ADMIN', legacy: false, fetch: vi.fn(), mutate: vi.fn(), success: vi.fn(), error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated', session: { user: { role: mocks.role } } }),
}))
vi.mock('@/components/student-history-provider', () => ({ StudentName: ({ name }: { name: string }) => <span>{name}</span> }))
vi.mock('@/components/sunday-school-roster-import', () => ({ SundaySchoolRosterImport: () => null }))
vi.mock('@/components/sunday-school-roster-link-dialog', () => ({ SundaySchoolRosterLinkDialog: () => null }))
vi.mock('@/lib/swr', () => ({
  useSundaySchoolChildren: () => ({ data: [{
    id: 'child', firstName: 'Henry', lastName: 'Test', level: 'GRADE_1', isActive: true, familyId: 'family',
    guardianName: 'Legacy Parent', guardianPhone: '2015550123',
    family: {
      id: 'family', name: 'Test family', homeAddress: '1 Main St', motherName: mocks.legacy ? '' : 'Mary', children: [],
      matchingHistory: { events: [{ at: '2026-10-23', childIds: ['child'], sources: [],
        filled: [{ field: 'homeAddress', sourceFamilyId: 'source' }],
        conflicts: [{ field: 'motherName', values: ['Mary', 'Mery'] }],
      }] },
    },
  }], isLoading: false, mutate: mocks.mutate }),
  useSundaySchoolClasses: () => ({ data: [{ id: 'class', name: 'Grade 1', level: 'GRADE_1', canServe: true }] }),
  useSundaySchoolAgeGroups: () => ({ data: [] }),
  useSundaySchoolFamilies: () => ({ data: [], mutate: mocks.mutate }),
}))
import RosterPage from '@/app/dashboard/servants/roster/page'

describe('family matching roster controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'SUPER_ADMIN'
    mocks.legacy = false
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())
  it('runs the existing-roster match and refreshes children and families', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ linkedChildren: 2, filledFields: 1, conflicts: 1 }) })
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Match existing families' }))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Connected 2 children and filled 1 missing family details', expect.anything()))
    expect(mocks.fetch).toHaveBeenCalledWith('/api/sunday-school/families/match', { method: 'POST' })
    expect(mocks.mutate).toHaveBeenCalledTimes(2)
  })
  it('shows a failed match without reporting success', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Forbidden' }) })
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Match existing families' }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Forbidden'))
    expect(mocks.success).not.toHaveBeenCalled()
  })
  it('does not resend unchanged family details when saving a child', async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'child' }) })
    render(<RosterPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Henry Test' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled())
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(body.familyId).toBe('family')
    expect(body).not.toHaveProperty('family')
  })
  it('keeps the designated guardian visible after legacy siblings acquire a family record', () => {
    mocks.legacy = true
    render(<RosterPage />)
    expect(screen.getByText(/Legacy Parent/)).toBeInTheDocument()
  })
  it('hides ministry-wide matching for a servant and shows family conflicts and filled fields', async () => {
    mocks.role = 'SERVANT'
    render(<RosterPage />)
    expect(screen.queryByRole('button', { name: 'Match existing families' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Test family' }))
    expect(await screen.findByText('Family details to review')).toBeInTheDocument()
    expect(screen.getByText('Mary / Mery')).toBeInTheDocument()
    expect(screen.getByText('Filled from matching family records: Home address.')).toBeInTheDocument()
  })
})
