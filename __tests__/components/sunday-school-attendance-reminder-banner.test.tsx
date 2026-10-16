import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ pathname: '/dashboard/servants', status: 'authenticated', reminders: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'servant' } }, status: mocks.status }) }))
vi.mock('@/lib/swr', () => ({ useSundaySchoolAttendanceReminders: mocks.reminders }))
import { SundaySchoolAttendanceReminderBanner } from '@/components/sunday-school-attendance-reminder-banner'
const reminder = { classId: 'class', className: 'Grade 6', sessionDate: '2026-10-18', url: '/dashboard/servants/attendance?classId=class&date=2026-10-18' }

describe('attendance reminder banner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.pathname = '/dashboard/servants'
    mocks.status = 'authenticated'
    mocks.reminders.mockReturnValue({ data: { reminders: [reminder] } })
  })
  it('has no dismissal control and links directly to the pending attendance', () => {
    render(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Take attendance/ })).toHaveAttribute('href', reminder.url)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(mocks.reminders).toHaveBeenCalledWith('servant')
  })
  it('remains visible on the attendance page until the server reports completion', () => {
    mocks.pathname = '/dashboard/servants/attendance'
    const { rerender } = render(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    mocks.reminders.mockReturnValue({ data: { reminders: [] } })
    rerender(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('shows separate links when multiple classes need attendance', () => {
    mocks.reminders.mockReturnValue({ data: { reminders: [reminder, { ...reminder, classId: 'other', className: 'Grade 7' }] } })
    render(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.getAllByRole('link')).toHaveLength(2)
  })
  it.each(['/dashboard/student', '/dashboard/admin', '/settings'])('does not show on the prep side or outside Sunday School: %s', path => {
    mocks.pathname = path
    render(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.reminders).toHaveBeenCalledWith(undefined)
  })
  it('does not fetch before authentication', () => {
    mocks.status = 'unauthenticated'
    render(<SundaySchoolAttendanceReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mocks.reminders).toHaveBeenCalledWith(undefined)
  })
})
