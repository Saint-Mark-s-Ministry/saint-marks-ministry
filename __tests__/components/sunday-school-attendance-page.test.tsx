import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolLevel } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toastError: vi.fn(),
  refreshTrend: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated' }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolClasses: () => ({
    data: [{
      id: 'class-1',
      name: '5th Grade',
      level: SundaySchoolLevel.GRADE_5,
      academicYearId: 'year-1',
      canServe: true,
    }],
    isLoading: false,
  }),
  useSundaySchoolDashboard: () => ({
    data: undefined,
    isLoading: false,
    isValidating: false,
    mutate: mocks.refreshTrend,
  }),
}))

vi.mock('@/lib/sunday-school-class', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/sunday-school-class')>()),
  isSessionDateToday: () => false,
}))

vi.mock('@/components/sunday-school-recent-attendance-chart', () => ({
  SundaySchoolRecentAttendanceChart: () => null,
}))

import SundaySchoolAttendancePage from '@/app/dashboard/servants/attendance/page'

describe('Sunday School attendance page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('/api/sunday-school/sessions?')) {
        return { ok: true, json: async () => [] }
      }
      if (url.startsWith('/api/sunday-school/children?')) {
        return {
          ok: true,
          json: async () => [{
            id: 'child-1',
            firstName: 'Mina',
            lastName: 'Mark',
            level: SundaySchoolLevel.GRADE_5,
          }],
        }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  })

  it('keeps past child attendance editable, starts unmarked, and requires every child to be marked', async () => {
    const user = userEvent.setup()
    render(<SundaySchoolAttendancePage />)

    expect(await screen.findByText('Mina Mark')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /excused/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Present' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Late' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Not present' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Present' })).toBeEnabled()
    expect(screen.queryByText(/Past attendance is read-only/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save attendance' }))

    expect(mocks.toastError).toHaveBeenCalledWith('Select attendance for 1 child before saving')
    await waitFor(() => {
      expect(mocks.fetch).not.toHaveBeenCalledWith(
        '/api/sunday-school/sessions',
        expect.objectContaining({ method: 'POST' })
      )
    })

    await user.click(screen.getByRole('button', { name: 'Not present' }))
    expect(screen.getByRole('button', { name: 'Not present' })).toHaveAttribute('aria-pressed', 'true')
  })
})
