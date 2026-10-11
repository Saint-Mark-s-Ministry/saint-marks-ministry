import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  pathname: '/dashboard/student',
  role: 'STUDENT',
  state: {
    annualMentorRequired: true,
    academicYear: { id: 'year-2026', name: '2026-2027' },
    missingDetails: ['mentorInformation'],
    complete: false,
  } as {
    annualMentorRequired: boolean
    academicYear: { id: string; name: string } | null
    missingDetails: string[]
    complete: boolean
  } | undefined,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'student-1', role: mocks.role } },
    status: 'authenticated',
  }),
}))

vi.mock('@/lib/swr', () => ({
  useStudentApplicationState: () => ({ data: mocks.state }),
}))

import { AnnualMentorReminderBanner } from '@/components/annual-mentor-reminder-banner'

describe('AnnualMentorReminderBanner', () => {
  beforeEach(() => {
    mocks.pathname = '/dashboard/student'
    mocks.role = 'STUDENT'
    mocks.state = {
      annualMentorRequired: true,
      academicYear: { id: 'year-2026', name: '2026-2027' },
      missingDetails: ['mentorInformation'],
      complete: false,
    }
  })

  it('shows a prominent required banner for incomplete Year 2 mentor information', () => {
    render(<AnnualMentorReminderBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent('Confirm your mentor information')
    expect(screen.getByRole('alert')).toHaveTextContent('2026–2027')
    expect(screen.getByRole('link', { name: /Complete mentor form/ })).toHaveAttribute(
      'href',
      '/dashboard/student/application'
    )
  })

  it('also prompts a Year 1 student whose original mentor section is incomplete', () => {
    mocks.state = {
      annualMentorRequired: false,
      academicYear: null,
      missingDetails: ['mentorInformation'],
      complete: false,
    }

    render(<AnnualMentorReminderBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent('Complete your mentor information')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'finish your Servants Prep application'
    )
    expect(screen.getByRole('link', { name: /Complete mentor form/ })).toHaveAttribute(
      'href',
      '/dashboard/student/application'
    )
  })

  it('hides after the mentor information is complete', () => {
    mocks.state = { ...mocks.state!, complete: true, missingDetails: [] }
    render(<AnnualMentorReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not duplicate the reminder on the mentor form itself', () => {
    mocks.pathname = '/dashboard/student/application'
    render(<AnnualMentorReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not show for non-student accounts', () => {
    mocks.role = 'SUPER_ADMIN'
    render(<AnnualMentorReminderBanner />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
