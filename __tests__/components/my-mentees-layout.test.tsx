import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
})
