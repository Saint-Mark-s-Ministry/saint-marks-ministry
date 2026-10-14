import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SundaySchoolLevel } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  toastError: vi.fn(),
  refreshTrend: vi.fn(),
  history: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('sonner', () => ({
  toast: { error: mocks.toastError, success: vi.fn() },
}))

vi.mock('@/hooks/useSundaySchoolGuard', () => ({
  useSundaySchoolGuard: () => ({ status: 'authenticated', session: { user: { id: 'servant-1' } } }),
}))

vi.mock('@/lib/swr', () => ({
  useSundaySchoolIndividualAttendance: mocks.history,
  useSundaySchoolAgeGroups: () => ({ data: [] }),
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
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value) },
      removeItem: (key: string) => { memory.delete(key) },
    })
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.history.mockReturnValue({ data: { dates: ['2026-10-04', '2026-10-11'], children: [
      { id: 'child-1', firstName: 'Mina', lastName: 'Mark', rate: 100, counts: { present: 1, late: 0, absent: 0, excused: 0 }, attendance: { '2026-10-04': 'PRESENT' } },
      { id: 'child-2', firstName: 'Abanoub', lastName: 'Saad', rate: 0, counts: { present: 0, late: 0, absent: 1, excused: 0 }, attendance: { '2026-10-04': 'ABSENT' } },
    ] }, mutate: vi.fn() })
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



  it('opens only the selected child’s history and restores focus without changing marks', async () => {
    const user = userEvent.setup()
    render(<SundaySchoolAttendancePage />)
    const mina = await screen.findByRole('button', { name: 'View attendance history for Mina Mark' })
    const present = within(mina.closest('li')!).getByRole('button', { name: 'Present' })
    await user.click(present)
    await user.click(mina)
    const dialog = screen.getByRole('dialog', { name: 'Mina Mark — Attendance history' })
    expect(within(dialog).getByText('100%')).toBeInTheDocument()
    expect(within(dialog).getByText('Unrecorded')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Abanoub/)).not.toBeInTheDocument()
    const rows = within(dialog).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Oct 11, 2026')
    expect(rows[2]).toHaveTextContent('Oct 4, 2026')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mina).toHaveFocus()
    expect(present).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'View attendance history for Abanoub Saad' }))
    const other = screen.getByRole('dialog', { name: 'Abanoub Saad — Attendance history' })
    expect(within(other).getByText('0%')).toBeInTheDocument()
    expect(within(other).queryByText(/Mina/)).not.toBeInTheDocument()
  })

  it('loads history only after opening it and lets a failed request be retried', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    mocks.history.mockReturnValue({ error: new Error('Offline'), mutate: retry })
    render(<SundaySchoolAttendancePage />)
    const child = await screen.findByRole('button', { name: 'View attendance history for Mina Mark' })
    expect(mocks.history).not.toHaveBeenCalled()
    await user.click(child)
    expect(mocks.history).toHaveBeenCalledWith('class-1')
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Couldn’t load attendance history')
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
  })

  it('shows who last saved attendance when reopening a recorded week', async () => {
    const original = mocks.fetch.getMockImplementation()!
    mocks.fetch.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith('/api/sunday-school/sessions?')) return { ok: true, json: async () => [{ id: 'session-1' }] }
      if (url === '/api/sunday-school/sessions/session-1/attendance') return {
        ok: true, json: async () => ({ session: { id: 'session-1' }, roster: [{ id: 'child-1', firstName: 'Mina', lastName: 'Mark', level: SundaySchoolLevel.GRADE_5, attendance: null }], lastSavedBy: {
          savedAt: '2026-10-11T12:30:00Z', recorder: { id: 'servant-2', name: 'Mary Mark' },
        } }),
      }
      return original(input)
    })
    render(<SundaySchoolAttendancePage />)
    expect(await screen.findByText('Mary Mark')).toBeInTheDocument()
    expect(within(screen.getByRole('status')).getByText('Mary Mark')).toBeInTheDocument()
    expect(screen.getAllByText(/Last saved by/)).toHaveLength(1)
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
    expect(screen.getByText(/2 unmarked/)).toBeInTheDocument()
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
  it('keeps the header, roster sections, and status slot mounted throughout autosaving', async () => {
    const user = userEvent.setup()
    const { container } = render(<SundaySchoolAttendancePage />)
    await screen.findByText('Mina Mark')
    const sections = container.firstElementChild!
    const originalSections = Array.from(sections.children)
    const headerText = originalSections[0].textContent
    const statusSlot = screen.getByRole('status')
    let acknowledge!: () => void
    mocks.fetch.mockImplementationOnce(async () => ({ ok: true, json: async () => ({ id: 'session-1' }) }))
    mocks.fetch.mockImplementationOnce(() => new Promise(resolve => {
      acknowledge = () => resolve({ ok: true, json: async () => ({ success: true, lastSavedBy: { savedAt: '2026-10-11T12:30:00Z', recorder: { id: 'servant-1', name: 'Mina Servant' } } }) })
    }))

    await user.click(within(screen.getByText('Mina Mark').closest('li')!).getByRole('button', { name: 'Present' }))
    expect(statusSlot).toHaveTextContent('1 pending')
    expect(Array.from(sections.children)).toEqual(originalSections)
    await waitFor(() => expect(statusSlot).toHaveTextContent('Saving marks…'))
    expect(Array.from(sections.children)).toEqual(originalSections)
    acknowledge()
    await waitFor(() => expect(statusSlot).toHaveTextContent('Last saved by Mina Servant'))
    expect(screen.getByRole('status')).toBe(statusSlot)
    expect(Array.from(sections.children)).toEqual(originalSections)
    expect(originalSections[0].textContent).toBe(headerText)
  })

})
