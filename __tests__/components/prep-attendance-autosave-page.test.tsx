import { fireEvent, render, screen, waitFor, within, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
const auth = vi.hoisted(() => ({ session: { user: { id: 'staff', role: 'SERVANT_PREP' } }, status: 'authenticated' }))
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => auth }))
vi.mock('@/components/student-profile-link', () => ({ StudentProfileLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
import AttendancePage from '@/app/dashboard/admin/attendance/page'

let fetcher: ReturnType<typeof vi.fn>
let failSave: boolean
beforeEach(() => {
  window.history.replaceState({}, '', '/dashboard/admin/attendance')
  const memory = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, val: string) => { memory.set(key, val) }, removeItem: (key: string) => { memory.delete(key) } })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  failSave = false
  const records = new Map<string, object>()
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/academic-years') return Response.json([{ id: 'year', name: '2026-2027', isActive: true }])
    if (url === '/api/enrollments') return Response.json(['Andrew', 'Zoe'].map((name, index) => ({ student: { id: index ? 'b' : 'a', name, email: `${name}@example.test` }, yearLevel: 'YEAR_1', isActive: true, isAsyncStudent: false })))
    if (url.startsWith('/api/lessons?')) return Response.json([{ id: 'lesson', title: 'Prayer', lessonNumber: 1, academicYearId: 'year', scheduledDate: '2000-01-02T00:00:00Z', status: 'COMPLETED', examSection: { displayName: 'Spirituality' }, _count: { attendanceRecords: records.size } }])
    if (url.startsWith('/api/attendance?')) return Response.json(Array.from(records.values()))
    if (url.startsWith('/api/expected-absences?')) return Response.json([])
    if (url === '/api/attendance/batch') {
      if (failSave) return Response.json({ error: 'Save refused' }, { status: 403 })
      const body = JSON.parse(String(init?.body))
      for (const row of body.records) records.set(row.studentId, row)
      return Response.json({ success: true, lastSavedBy: { savedAt: '2026-10-30T12:00:00Z', recorder: { id: 'staff', name: 'Staff' } } })
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const batches = () => fetcher.mock.calls.filter(([url]) => url === '/api/attendance/batch')
async function openLesson() {
  render(<AttendancePage />)
  fireEvent.click(await screen.findByRole('button', { name: /Lesson 1 · Prayer/ }))
  await waitFor(() => expect(within(screen.getByRole('table')).getByRole('row', { name: /Andrew/ })).toBeInTheDocument())
  await waitFor(() => expect(screen.queryByText('Loading attendance…')).not.toBeInTheDocument())
  return within(screen.getByRole('table')).getByRole('row', { name: /Andrew/ })
}
describe('Prep attendance autosave page', () => {
  it('autosaves a mark without closing roll call and finishes remaining unmarked students deliberately', async () => {
    const row = await openLesson()
    fireEvent.click(within(row).getByRole('button', { name: 'Present' }))
    await waitFor(() => expect(batches()).toHaveLength(1), { timeout: 2500 })
    expect(JSON.parse(String(batches()[0][1]?.body))).toMatchObject({ finalize: false, records: [{ studentId: 'a', status: 'PRESENT' }] })
    expect(JSON.parse(String(batches()[0][1]?.body)).records).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Finish attendance' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish attendance' }))
    await waitFor(() => expect(batches()).toHaveLength(2))
    expect(JSON.parse(String(batches()[1][1]?.body))).toMatchObject({ finalize: true, records: [expect.objectContaining({ studentId: 'a', status: 'PRESENT' }), expect.objectContaining({ studentId: 'b', status: 'ABSENT' })] })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Finish attendance' })).not.toBeInTheDocument())
  })
  it('keeps refused saves visible and retries without finalizing the other students', async () => {
    failSave = true
    const row = await openLesson()
    fireEvent.click(within(row).getByRole('button', { name: 'Late' }))
    await screen.findByRole('button', { name: 'Retry save' }, { timeout: 2500 })
    expect(screen.getByRole('button', { name: 'Finish attendance' })).toBeInTheDocument()
    expect(screen.queryByText(/Saved by Staff/)).not.toBeInTheDocument()
    failSave = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument())
    expect(JSON.parse(String(batches()[1][1]?.body))).toMatchObject({ finalize: false, records: [{ studentId: 'a', status: 'LATE' }] })
  })
})
