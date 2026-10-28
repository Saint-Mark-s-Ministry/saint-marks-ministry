import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SWRConfig } from 'swr'
import { MenteeAttendanceHistory } from '@/components/mentees/attendance-history'
import type { MenteeAttendanceHistory as History } from '@/types/mentee-attendance'

const mocks = vi.hoisted(() => ({ role: 'MENTOR' }))

vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => ({
    session: { user: { id: 'mentor-1', role: mocks.role } },
    status: 'authenticated',
  }),
}))

import MyMenteesPage from '@/app/dashboard/mentor/my-mentees/page'

const analytics = (eligible: boolean, attendance: number, exam: number) => ({
  enrollment: { yearLevel: 'YEAR_2', status: 'ACTIVE' },
  attendance: {
    percentage: attendance, presentCount: 30, lateCount: 1, absentCount: 2, excusedCount: 0,
    effectivePresent: 30.5, totalLessons: 33, conductDismissalCount: 0, met: attendance >= 75,
  },
  exams: { overallAverage: exam, sectionAverages: [], missingExams: [], examsTaken: 1, totalApplicableExams: 1 },
  graduation: { eligible, attendanceMet: attendance >= 75, overallAverageMet: exam >= 75, allSectionsPassing: eligible },
})

const enrollment = (id: string, name: string) => ({
  id: `e-${id}`, yearLevel: 'YEAR_2', status: 'ACTIVE', student: { id, name, email: `${id}@example.com` },
})

function stubApi(enrollments: unknown[], byStudent: Record<string, unknown> = {}) {
  const fetchMock = vi.fn(async (url: string) => {
    const match = url.match(/\/api\/students\/([^/]+)\/analytics/)
    return { ok: true, json: async () => (match ? byStudent[match[1]] : enrollments) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('My mentees', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    mocks.role = 'MENTOR'
  })

  it('says what to do when a mentor has no mentees', async () => {
    stubApi([])
    render(<MyMenteesPage />)
    expect(await screen.findByRole('heading', { name: 'My mentees' })).toBeInTheDocument()
    expect(screen.getByText('Ask an administrator to assign mentees to you.')).toBeInTheDocument()
  })

  it('loads only this mentor’s students and lists at-risk mentees first', async () => {
    const fetchMock = stubApi([enrollment('a', 'Andrew Shehata'), enrollment('e', 'Elaria Matta')], {
      a: analytics(true, 93, 81),
      e: analytics(false, 92, 56),
    })
    render(<MyMenteesPage />)
    const links = await screen.findAllByRole('link', { name: /Shehata|Matta/ })
    expect(links.map((l) => l.textContent)).toEqual(['Elaria Matta', 'Andrew Shehata'])
    expect(fetchMock).toHaveBeenCalledWith('/api/enrollments?mentorId=mentor-1')
    const card = links[0].closest('section') as HTMLElement
    expect(within(card).getByText('At risk')).toBeInTheDocument()
    expect(within(card).getByText('Exam avg ≥ 75%').parentElement).toHaveTextContent('not met')
  })

  it('shows priests every enrolled student', async () => {
    mocks.role = 'PRIEST'
    const fetchMock = stubApi([])
    render(<MyMenteesPage />)
    expect(await screen.findByRole('heading', { name: 'All students' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/enrollments')
  })

  it('loads history only for the expanded mentee and rechecks access when reopened', async () => {
    let allowed = true
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/analytics')) return Response.json(analytics(true, 93, 81))
      if (url.endsWith('/notes')) return Response.json([])
      if (url.endsWith('/attendance')) return allowed
        ? Response.json({ isAsyncStudent: false, records: [history.records[0]] })
        : Response.json({ error: 'Forbidden' }, { status: 403 })
      return Response.json([enrollment('a', 'Andrew Shehata'), enrollment('b', 'Other Mentee')])
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<SWRConfig value={{ provider: () => new Map() }}><MyMenteesPage /></SWRConfig>)
    const card = (await screen.findByRole('link', { name: 'Andrew Shehata' })).closest('section')!
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/attendance'))).toBe(false)
    fireEvent.click(within(card).getByRole('button', { name: 'Show details' }))
    expect(await screen.findByText('Lesson 1')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/students/a/attendance')
    expect(fetchMock).not.toHaveBeenCalledWith('/api/students/b/attendance')

    fireEvent.click(within(card).getByRole('button', { name: 'Hide details' }))
    allowed = false
    fireEvent.click(within(card).getByRole('button', { name: 'Show details' }))
    expect(await screen.findByText('You no longer have access to this student’s attendance.')).toBeInTheDocument()
    expect(screen.queryByText('Lesson 1')).not.toBeInTheDocument()
  })
})

const history: History = {
  isAsyncStudent: false,
  records: (['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'EXCUSED', 'EXCUSED'] as const).map((status, i) => ({
    id: String(i), status, notEnrolledYet: i === 4, expectedAbsenceNA: i === 5,
    lesson: { title: `Lesson ${i + 1}`, scheduledDate: '2026-10-25T00:00:00.000Z' },
  })),
}
const renderHistory = () => render(<SWRConfig value={{ provider: () => new Map() }}>
  <MenteeAttendanceHistory studentId="a" studentName="Andrew Shehata" viewerId="mentor-1" />
</SWRConfig>)

describe('Mentee attendance history', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows lesson dates, titles and each attendance mark, with special N/A records kept separate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(history)))
    renderHistory()
    expect(await screen.findByText('Lesson 1')).toBeInTheDocument()
    const section = within(screen.getByRole('region', { name: 'Attendance history for Andrew Shehata' }))
    expect(section.getAllByText('Sun, Oct 25, 2026')).toHaveLength(6)
    for (const mark of ['Present', 'Absent', 'Late', 'Excused']) expect(section.getByText(mark)).toBeInTheDocument()
    expect(section.getAllByText('N/A')).toHaveLength(2)
    expect(section.getByText('Before the student joined')).toBeInTheDocument()
    expect(section.getByText('Expected absence · not counted')).toBeInTheDocument()
    expect(section.queryByRole('button')).not.toBeInTheDocument()
    expect(section.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('shows loading while a request is pending', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderHistory()
    expect(screen.getByRole('status')).toHaveTextContent('Loading attendance history')
  })

  it('shows an empty history without assuming the student was absent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ isAsyncStudent: false, records: [] })))
    renderHistory()
    expect(await screen.findByText('No lesson attendance has been recorded for this student yet.')).toBeInTheDocument()
    expect(screen.queryByText('Absent')).not.toBeInTheDocument()
  })

  it('explains rotation attendance for async students instead of showing lesson absences', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...history, isAsyncStudent: true })))
    renderHistory()
    expect(await screen.findByText(/attendance is based on serving rotations/)).toBeInTheDocument()
    expect(screen.queryByText('Lesson 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Absent')).not.toBeInTheDocument()
  })

  it('allows retry after a temporary failure', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockImplementation(async () => Response.json(history))
    vi.stubGlobal('fetch', fetchMock)
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByText('Lesson 1')).toBeInTheDocument())
  })
})
