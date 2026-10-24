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

describe('automatic family matching roster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.role = 'SUPER_ADMIN'
    mocks.legacy = false
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())
  it.each(['SUPER_ADMIN', 'PRIEST', 'SERVANT'])('needs no manual matching or page-load writes for %s', async role => {
    mocks.role = role
    render(<RosterPage />)
    await screen.findByText('Henry Test')
    expect(screen.queryByRole('button', { name: 'Match existing families' })).not.toBeInTheDocument()
    expect(mocks.fetch).not.toHaveBeenCalled()
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
  it('shows family conflicts and filled fields to an authorized servant', async () => {
    mocks.role = 'SERVANT'
    render(<RosterPage />)
    expect(screen.queryByRole('button', { name: 'Match existing families' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Test family' }))
    expect(await screen.findByText('Family details to review')).toBeInTheDocument()
    expect(screen.getByText('Mary / Mery')).toBeInTheDocument()
    expect(screen.getByText('Filled from matching family records: Home address.')).toBeInTheDocument()
  })
})
