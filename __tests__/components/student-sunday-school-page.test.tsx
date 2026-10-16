import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  assignments: vi.fn(),
  fetch: vi.fn(),
  session: {
    user: { id: 'student-1', role: 'STUDENT', isAsyncStudent: true },
    impersonating: { originalId: 'admin-1' },
  },
}))
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: mocks.session,
  }),
}))
vi.mock('@/lib/auth-helpers', () => ({
  requireAuth: async () => ({ id: 'student-1', role: 'STUDENT' }),
}))
vi.mock('@/lib/api-utils', () => ({ getMentorStudentIds: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: { sundaySchoolAssignment: { findMany: mocks.assignments } },
}))

import { GET } from '@/app/api/sunday-school/progress/route'
import SundaySchoolPage from '@/app/dashboard/student/sunday-school/page'

function assignment(isActive = true, linkedClass: { id: string; name: string; level?: 'GRADE_3'; classroom?: string | null } | null = { id: 'class-1', name: 'Third Grade Girls', classroom: 'Room 203', level: 'GRADE_3' }) {
  return {
    id: 'assignment-1', grade: 'GRADE_3', yearLevel: null,
    class: linkedClass, academicYear: { id: 'year-1', name: '2026-2027' },
    totalWeeks: 4, rotationForm: null, startDate: new Date('2026-09-06T00:00:00Z'), isActive,
    logs: [{ weekNumber: 1, status: 'VERIFIED' }],
  }
}

describe('Async student Sunday School page', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.assignments.mockResolvedValue([assignment()])
    mocks.fetch.mockImplementation(async (url: string) => GET(new Request(`http://localhost${url}`)))
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders the real progress response when viewing as a student, with one form status for the assigned rotation', async () => {
    render(<SundaySchoolPage />)
    expect(await screen.findByText('Third Grade Girls · 2026-2027')).toBeInTheDocument()
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
    expect(screen.getAllByText('Not submitted')).toHaveLength(1)
    expect(screen.getByText('Classroom: Room 203')).toBeInTheDocument()
    expect(screen.getByText('Four-week rotation: Sep 6, 2026 – Sep 27, 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Completed four-week form')).toHaveAttribute('id', 'rotation-form-assignment-1')
    expect(screen.queryByLabelText('Submit attendance code')).not.toBeInTheDocument()
    expect(mocks.assignments).toHaveBeenCalledWith(expect.objectContaining({
      where: { studentId: 'student-1' },
      include: expect.objectContaining({ class: { select: { id: true, name: true, classroom: true, level: true } } }),
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    }))
  })

  it('explains when the current classroom has not been set', async () => {
    mocks.assignments.mockResolvedValue([assignment(true, { id: 'class-1', name: 'Third Grade Girls', classroom: null })])
    render(<SundaySchoolPage />)
    expect(await screen.findByText(/Classroom: Not set/)).toBeInTheDocument()
  })

  it('keeps grade-only, finished rotations visible without a code form', async () => {
    mocks.assignments.mockResolvedValue([assignment(false, null)])
    render(<SundaySchoolPage />)
    expect(await screen.findByText('3rd Grade · 2026-2027')).toBeInTheDocument()
    expect(screen.getByText('Past rotation')).toBeInTheDocument()
    expect(screen.queryByLabelText('Submit attendance code')).not.toBeInTheDocument()
  })

  it('shows the unassigned state only after a successful empty response', async () => {
    mocks.assignments.mockResolvedValue([])
    render(<SundaySchoolPage />)
    expect(await screen.findByText('No serving assignment yet')).toBeInTheDocument()
  })

  it('shows a retryable error on a failed request instead of claiming no assignment exists', async () => {
    mocks.fetch.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    render(<SundaySchoolPage />)
    expect(await screen.findByText('Could not load your serving assignment')).toBeInTheDocument()
    expect(screen.queryByText('No serving assignment yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Third Grade Girls · 2026-2027')).toBeInTheDocument()
  })
})
