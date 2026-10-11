import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ dashboard: {} as Record<string, unknown>, params: '', error: undefined as Error | undefined }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.params), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useSundaySchoolGuard', () => ({ useSundaySchoolGuard: () => ({ status: 'authenticated', hasAccess: true }) }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolDashboard: () => ({ data: mocks.dashboard, isLoading: false, error: mocks.error, mutate: vi.fn() }) }))
vi.mock('@/components/sunday-school-servants-meetings', () => ({
  SundaySchoolServantsMeetings: ({ ageGroupId, initialMeetingId }: { ageGroupId: string; initialMeetingId?: string }) => <div data-testid="meeting-roster">{ageGroupId}:{initialMeetingId ?? 'list'}</div>,
}))
import MeetingsPage from '@/app/dashboard/servants/servant-attendance/meetings/page'

const elementary = { id: 'elementary', name: 'Elementary School', canCoordinate: false }
describe('dedicated servants meeting page', () => {
  beforeEach(() => {
    mocks.params = ''
    mocks.error = undefined
    mocks.dashboard = {
      ageGroups: [elementary, { id: 'middle', name: 'Middle School', canCoordinate: false }],
      classes: [{ id: 'class-1', ageGroup: { id: 'elementary' } }],
      standing: { isAdmin: false, readOnly: false },
    }
  })

  it('opens the meeting section for ordinary Elementary servants and links both attendance pages', () => {
    render(<MeetingsPage />)
    expect(screen.getByTestId('meeting-roster')).toHaveTextContent('elementary:list')
    expect(screen.getByRole('link', { name: 'Servants meetings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Class attendance' })).toHaveAttribute('href', '/dashboard/servants/servant-attendance')
  })

  it('supports direct links to a recorded session', () => {
    mocks.params = 'ageGroupId=elementary&meetingId=october-3'
    render(<MeetingsPage />)
    expect(screen.getByTestId('meeting-roster')).toHaveTextContent('elementary:october-3')
  })

  it('does not mount an Elementary roster for a servant assigned only to another school', () => {
    mocks.dashboard.classes = [{ id: 'middle-class', ageGroup: { id: 'middle' } }]
    mocks.params = 'ageGroupId=elementary'
    render(<MeetingsPage />)
    expect(screen.queryByTestId('meeting-roster')).not.toBeInTheDocument()
    expect(screen.getByText(/available to Elementary school servants/)).toBeInTheDocument()
  })

  it('allows a band coordinator before the group has any classes', () => {
    mocks.dashboard.classes = []
    mocks.dashboard.ageGroups = [{ ...elementary, canCoordinate: true }]
    render(<MeetingsPage />)
    expect(screen.getByTestId('meeting-roster')).toHaveTextContent('elementary:list')
  })

  it('keeps the page available for priests with read-only dashboard scope', () => {
    mocks.dashboard.classes = []
    mocks.dashboard.standing = { isAdmin: false, readOnly: true }
    render(<MeetingsPage />)
    expect(screen.getByTestId('meeting-roster')).toHaveTextContent('elementary:list')
  })

  it('shows a retry without loading a roster if scope cannot be fetched', () => {
    mocks.error = new Error('Network error')
    render(<MeetingsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    expect(screen.queryByTestId('meeting-roster')).not.toBeInTheDocument()
  })
})
