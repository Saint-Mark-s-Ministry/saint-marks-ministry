import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: { user: { id: 'staff', role: 'SERVANT_PREP' } },
  status: 'authenticated',
}))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => auth }))
vi.mock('@/components/student-profile-provider', () => ({ useStudentProfileModal: () => null }))

import EnrollmentsPage from '@/app/dashboard/admin/enrollments/page'

function enrollment(id: string, name: string, yearLevel = 'YEAR_1', profileImageUrl: string | null = null) {
  return {
    id, yearLevel, isActive: true, isAsyncStudent: false, status: 'ACTIVE',
    student: { id, name, email: `${id}@example.com`, profileImageUrl },
    mentor: null, fatherOfConfession: null, academicYear: null, graduatedAcademicYear: null,
  }
}

const records = [
  enrollment('zoe', 'Zoe Adel', 'YEAR_1', 'https://example.com/zoe.jpg'),
  enrollment('mina', 'Mina Youssef'),
  enrollment('anna', 'Anna George', 'YEAR_2'),
]

function desktopNames() {
  return within(screen.getByRole('table')).getAllByRole('link').map(link => link.textContent)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') return Response.json({ ...records[0], fatherOfConfession: { id: 'father', name: 'Fr Mark' } })
    if (url === '/api/enrollments') return Response.json(records)
    if (url === '/api/fathers-of-confession') return Response.json([{ id: 'father', name: 'Fr Mark' }])
    return Response.json([])
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('Servants Prep roster', () => {
  it('shows photos on desktop and mobile, retains initials without a photo, and keeps photos after edits', async () => {
    render(<EnrollmentsPage />)
    await screen.findByRole('table')
    const photos = screen.getAllByRole('button', { name: "View Zoe Adel's photo" })
    expect(photos).toHaveLength(2)
    for (const photo of photos) expect(photo.querySelector('img')).toHaveAttribute('src', 'https://example.com/zoe.jpg')
    expect(screen.getAllByText('MY')).toHaveLength(2)

    fireEvent.change(screen.getAllByRole('combobox', { name: 'Father of confession for Zoe Adel' })[0], { target: { value: 'father' } })
    await waitFor(() => expect(screen.getAllByRole('combobox', { name: 'Father of confession for Zoe Adel' })[1]).toHaveValue('father'))
    expect(screen.getAllByRole('button', { name: "View Zoe Adel's photo" })).toHaveLength(2)
  })

  it('defaults to first-name A–Z and switches both layouts to last-name A–Z', async () => {
    render(<EnrollmentsPage />)
    await screen.findByRole('table')
    expect(desktopNames()).toEqual(['Anna George', 'Mina Youssef', 'Zoe Adel'])
    fireEvent.change(screen.getByRole('combobox', { name: 'Name order' }), { target: { value: 'last' } })
    expect(desktopNames()).toEqual(['Zoe Adel', 'Anna George', 'Mina Youssef'])
    const lists = screen.getAllByRole('list')
    const roster = lists.find(list => within(list).queryAllByRole('link').length === 3)!
    expect(within(roster).getAllByRole('link').map(link => link.textContent)).toEqual(['Zoe Adel', 'Anna George', 'Mina Youssef'])
  })

  it('keeps the selected order while filtering and searching', async () => {
    render(<EnrollmentsPage />)
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('combobox', { name: 'Name order' }), { target: { value: 'last' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Year level' }), { target: { value: 'YEAR_1' } })
    expect(desktopNames()).toEqual(['Zoe Adel', 'Mina Youssef'])
    fireEvent.change(screen.getByPlaceholderText('Search students'), { target: { value: 'mina' } })
    expect(desktopNames()).toEqual(['Mina Youssef'])
    expect(screen.getByRole('combobox', { name: 'Name order' })).toHaveValue('last')
  })
})
