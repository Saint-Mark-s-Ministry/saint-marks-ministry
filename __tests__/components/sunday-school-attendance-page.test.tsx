import { render, screen, waitFor, within } from '@testing-library/react'
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
          json: async () => [
            { id: 'child-1', firstName: 'Mina', lastName: 'Mark', level: SundaySchoolLevel.GRADE_5 },
            { id: 'child-2', firstName: 'Abanoub', lastName: 'Saad', level: SundaySchoolLevel.GRADE_5 },
          ],
        }
      }
      if (url === '/api/sunday-school/sessions') {
        return { ok: true, json: async () => ({ id: 'session-1' }) }
      }
      if (url === '/api/sunday-school/attendance/batch') {
        return { ok: true, json: async () => ({ success: true }) }
      }
      throw new Error(`Unexpected request: ${url}`)
    })
  })

  it('keeps past child attendance editable and starts unmarked', async () => {
    render(<SundaySchoolAttendancePage />)

    expect(await screen.findByText('Mina Mark')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /excused/i })).not.toBeInTheDocument()
    const [present] = screen.getAllByRole('button', { name: 'Present' })
    expect(present).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: 'Late' })[0]).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: 'Not present' })[0]).toHaveAttribute('aria-pressed', 'false')
    expect(present).toBeEnabled()
    expect(screen.queryByText(/Past attendance is read-only/i)).not.toBeInTheDocument()
    expect(screen.getByText(/2 not marked will be saved as absent/)).toBeInTheDocument()
  })

  it('saves children left unmarked as absent', async () => {
    const user = userEvent.setup()
    render(<SundaySchoolAttendancePage />)
    expect(await screen.findByText('Abanoub Saad')).toBeInTheDocument()

    // Mark only Mina present, then save
    const minaRow = screen.getByText('Mina Mark').closest('li')!
    await user.click(within(minaRow).getByRole('button', { name: 'Present' }))
    await user.click(screen.getByRole('button', { name: 'Save attendance' }))

    await waitFor(() => {
      const batch = mocks.fetch.mock.calls.find(([url]) => url === '/api/sunday-school/attendance/batch')
      expect(batch).toBeDefined()
      expect(JSON.parse(batch![1].body).records).toEqual([
        { childId: 'child-1', status: 'PRESENT' },
        { childId: 'child-2', status: 'ABSENT' },
      ])
    })
    expect(mocks.toastError).not.toHaveBeenCalled()
    // The unmarked child now shows as absent
    const abanoubRow = screen.getByText('Abanoub Saad').closest('li')!
    await waitFor(() =>
      expect(within(abanoubRow).getByRole('button', { name: 'Not present' })).toHaveAttribute('aria-pressed', 'true')
    )
  })
})
