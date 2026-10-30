import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  session: { user: { id: 'staff', role: 'SERVANT_PREP' } },
  status: 'authenticated',
  query: '',
}))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(auth.query), useRouter: () => ({ replace: vi.fn() }) }))
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
  auth.query = ''
  auth.session.user.role = 'SERVANT_PREP'
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'PATCH') return Response.json({ ...records[0], fatherOfConfession: { id: 'father', name: 'Fr Mark' } })
    if (url === '/api/enrollments') return Response.json(records)
    if (url === '/api/fathers-of-confession') return Response.json([{ id: 'father', name: 'Fr Mark' }])
    return Response.json([])
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('Servants Prep roster', () => {
  it('counts only active students in mentor workload and preserves the roster status when selecting mentors', async () => {
    const mentor = { id: 'mentor-1', name: 'Current Mentor', email: 'mentor@example.com' }
    const formerMentor = { id: 'mentor-2', name: 'Former Mentor', email: 'former@example.com' }
    const mixedRecords = [
      { ...enrollment('active', 'Active Student'), mentor },
      { ...enrollment('async', 'Async Student'), isAsyncStudent: true, mentor },
      { ...enrollment('graduated', 'Graduated Student'), status: 'GRADUATED', isActive: false, mentor },
      { ...enrollment('withdrawn', 'Withdrawn Student'), status: 'WITHDRAWN', isActive: false, mentor },
      { ...enrollment('former', 'Former Student'), status: 'GRADUATED', isActive: false, mentor: formerMentor },
      enrollment('unassigned', 'Unassigned Student'),
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(
      url === '/api/enrollments' ? mixedRecords : url === '/api/mentor-options' ? [mentor, formerMentor] : []
    )))
    render(<EnrollmentsPage />)
    await screen.findByRole('table')

    const workload = within(screen.getByRole('heading', { name: 'Mentor workload' }).closest('section')!)
    const current = workload.getByRole('button', { name: /Current Mentor/ })
    expect(current).toHaveTextContent('Current Mentor2')
    expect(workload.getByRole('button', { name: /Former Mentor/ })).toHaveTextContent('Former Mentor0')

    fireEvent.click(current)
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('ACTIVE')
    expect(desktopNames()).toEqual(['Active Student', 'Async Student'])

    fireEvent.click(screen.getByRole('combobox', { name: 'Filter by mentor' }))
    const mentorOptions = within(screen.getByRole('listbox'))
    expect(mentorOptions.getByRole('option', { name: /Current Mentor/ })).toHaveTextContent('Current Mentor2')
    fireEvent.click(mentorOptions.getByRole('option', { name: /Former Mentor/ }))
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('ACTIVE')
    expect(screen.queryByText('Former Student')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'GRADUATED' } })
    expect(desktopNames()).toEqual(['Former Student'])
    fireEvent.click(current)
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('GRADUATED')
    expect(desktopNames()).toEqual(['Graduated Student'])
    expect(current).toHaveTextContent('Current Mentor2')
  })

  const pending = {
    ...records[2],
    mentorContact: { name: 'Current Mentor', email: 'current@example.com', phone: '2015550123' },
    mentorForm: { status: 'PENDING_REVIEW', submission: {
      name: 'Current Mentor', email: 'current@example.com', phone: '2015550123',
      updatedAt: '2026-10-24T00:00:00.000Z', submittedAt: '2026-10-24T00:00:00.000Z',
    } },
  }

  it('keeps missing Year 2 forms unassigned and prevents manual assignment before submission', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url === '/api/enrollments'
      ? [{ ...records[2], mentorForm: { status: 'REQUIRED', submission: null } }] : [])))
    render(<EnrollmentsPage />)
    await screen.findByRole('table')
    expect(screen.getAllByText('Form not submitted')).toHaveLength(2)
    for (const field of screen.getAllByRole('combobox', { name: 'Assigned mentor account for Anna George' })) expect(field).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Verify mentor form for Anna George' })).not.toBeInTheDocument()
  })

  it.each(['ACTIVE', 'WITHDRAWN'])('lets Prep staff verify a notified %s student and refreshes both layouts', async (status) => {
    auth.query = 'studentId=anna'
    const student = { ...pending, status, isActive: status === 'ACTIVE' }
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST') return Response.json({ reviewed: true })
      if (url.startsWith('/api/enrollments?')) return Response.json([{ ...student, mentorForm: { ...student.mentorForm, status: 'REVIEWED' } }])
      return Response.json(url === '/api/enrollments' ? [student] : [])
    })
    vi.stubGlobal('fetch', fetch)
    render(<EnrollmentsPage />)
    const verify = (await screen.findAllByRole('button', { name: 'Verify mentor form for Anna George' }))[0]
    fireEvent.click(screen.getAllByText('Mentor', { exact: true }).find(element => element.tagName === 'SPAN')!)
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
    fireEvent.click(verify)
    await waitFor(() => expect(screen.getAllByText('Verified')).toHaveLength(2))
    expect(fetch).toHaveBeenCalledWith('/api/students/anna/mentor-information/review', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedAt: pending.mentorForm.submission.updatedAt }),
    })
    expect(screen.queryByRole('button', { name: 'Verify mentor form for Anna George' })).not.toBeInTheDocument()
    expect(fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false)
    if (status === 'WITHDRAWN') expect(within(screen.getByRole('table')).getByText('Withdrawn')).toBeInTheDocument()
  })

  it('keeps a stale submission pending when the server rejects verification', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => options?.method === 'POST'
      ? Response.json({ error: 'Mentor information changed. Refresh before reviewing.' }, { status: 409 })
      : Response.json(url === '/api/enrollments' ? [pending] : [])))
    render(<EnrollmentsPage />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Verify mentor form for Anna George' }))[0])
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Verify mentor form for Anna George' })[0]).toBeEnabled())
    expect(screen.getAllByText('Awaiting verification')).toHaveLength(2)
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
  })

  it('opens the notified student directly and leaves priest verification unavailable', async () => {
    auth.query = 'studentId=anna'
    auth.session.user.role = 'PRIEST'
    vi.stubGlobal('fetch', vi.fn(async (url: string) => Response.json(url === '/api/enrollments' ? [records[0], pending] : [])))
    render(<EnrollmentsPage />)
    await screen.findByRole('table')
    expect(screen.queryByText('Zoe Adel')).not.toBeInTheDocument()
    expect(screen.getAllByText('Anna George')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Verify mentor form for Anna George' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View full roster' })).toHaveAttribute('href', '/dashboard/admin/enrollments')
  })
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
