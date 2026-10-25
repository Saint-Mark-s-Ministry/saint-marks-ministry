import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ data: {} as Record<string, unknown>, error: undefined as Error | undefined }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolMeetings: () => mocks }))
import { SundaySchoolMeetingCheckInShortcut } from '@/components/sunday-school-meeting-checkin-shortcut'

describe('meeting check-in shortcut', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-17T16:00:00Z'))
    mocks.data = { canCheckIn: false, meeting: null }
    mocks.error = undefined
  })
  afterEach(() => vi.useRealTimers())

  it('hides the shortcut for a Sunday servant on Saturday', () => {
    render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('links to the exact meeting when the server permits self check-in today', () => {
    vi.setSystemTime(new Date('2026-10-18T16:00:00Z'))
    mocks.data = { canCheckIn: true, meeting: { id: 'october-18', date: '2026-10-18T00:00:00Z' } }
    render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.getByRole('link', { name: 'Meeting check-in' })).toHaveAttribute('href',
      '/dashboard/servants/servant-attendance/meetings?ageGroupId=high-school&meetingId=october-18')
  })

  it.each(['2026-10-16', '2026-10-18'])('hides cached check-in for another day: %s', date => {
    mocks.data = { canCheckIn: true, meeting: { id: 'other-day', date } }
    render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('requires server permission even when a visible meeting is today', () => {
    mocks.data = { canCheckIn: false, meeting: { id: 'today', date: '2026-10-17' } }
    render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('uses the church date and hides the shortcut after midnight in New York', () => {
    vi.setSystemTime(new Date('2026-10-19T03:59:00Z'))
    mocks.data = { canCheckIn: true, meeting: { id: 'october-18', date: '2026-10-18' } }
    const { rerender } = render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.getByRole('link')).toBeInTheDocument()
    vi.setSystemTime(new Date('2026-10-19T04:00:00Z'))
    rerender(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('hides cached permission when refreshing fails', () => {
    mocks.data = { canCheckIn: true, meeting: { id: 'today', date: '2026-10-17' } }
    mocks.error = new Error('Forbidden')
    render(<SundaySchoolMeetingCheckInShortcut ageGroupId="high-school" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
