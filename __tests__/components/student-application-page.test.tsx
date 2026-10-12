import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  session: { user: { id: 'async-student', role: 'STUDENT', isAsyncStudent: true } },
}))
vi.mock('@/hooks/useAdminGuard', () => ({
  useAdminGuard: () => ({ session: mocks.session, status: 'authenticated' }),
}))
import ApplicationPage from '@/app/dashboard/student/application/page'

const mentorApplication = {
  application: {
    fatherOfConfessionName: null, approvalFormUrl: null, approvalFormFilename: null,
    mentorName: 'Existing Mentor', mentorPhone: '555-0100', mentorEmail: null,
  },
  complete: false, showChurchInformation: false, showApprovalForm: false,
  annualMentorRequired: true, academicYear: { id: 'year-1', name: '2026-2027' },
}

describe('Async student application', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('shows mentor confirmation without claiming a legacy registration was approved', async () => {
    mocks.fetch.mockResolvedValue(Response.json(mentorApplication))
    render(<ApplicationPage />)
    expect(await screen.findByLabelText("Mentor Servant's Name")).toHaveValue('Existing Mentor')
    expect(screen.queryByText('Registration approved')).not.toBeInTheDocument()
    expect(screen.queryByText('Approval Form')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm mentor information' })).toBeInTheDocument()
  })

  it('displays the real request error in a full-width card and allows retry', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ error: 'Unable to load application' }, { status: 500 }))
    mocks.fetch.mockResolvedValueOnce(Response.json(mentorApplication))
    const { container } = render(<ApplicationPage />)
    expect(await screen.findByText('Unable to load application')).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('w-full', 'min-w-0')
    expect(screen.queryByText(/could not find an approved registration/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText("Mentor Servant's Name")).toHaveValue('Existing Mentor')
  })
})
