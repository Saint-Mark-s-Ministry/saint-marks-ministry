import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), pending: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/sunday-school-attendance-reminders', () => ({ getPendingSundaySchoolAttendance: mocks.pending }))
import { GET } from '@/app/api/sunday-school/attendance/reminders/route'

describe('personal attendance reminder endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth.mockResolvedValue({ id: 'servant', role: 'PRIEST' })
    mocks.context.mockResolvedValue({ userId: 'servant', disabled: false, readOnly: false })
    mocks.pending.mockResolvedValue([])
  })
  it('uses current database identity and returns only personal class summaries', async () => {
    mocks.pending.mockResolvedValue([{ userId: 'servant', classId: 'class', className: 'Class', sessionDate: '2026-10-18', url: '/attendance' }])
    const response = await GET()
    expect(await response.json()).toEqual({ reminders: [{ classId: 'class', className: 'Class', sessionDate: '2026-10-18', url: '/attendance' }] })
    expect(mocks.context).toHaveBeenCalledWith('servant')
    expect(mocks.pending).toHaveBeenCalledWith(expect.any(Date), 'servant')
  })
  it('blocks disabled users', async () => {
    mocks.context.mockResolvedValue({ userId: 'servant', disabled: true })
    expect((await GET()).status).toBe(403)
    expect(mocks.pending).not.toHaveBeenCalled()
  })
  it('does not prompt read-only priests', async () => {
    mocks.context.mockResolvedValue({ userId: 'servant', disabled: false, readOnly: true })
    expect(await (await GET()).json()).toEqual({ reminders: [] })
    expect(mocks.pending).not.toHaveBeenCalled()
  })
  it('requires authentication', async () => {
    mocks.auth.mockRejectedValue(new Error('Unauthorized'))
    expect((await GET()).status).toBe(401)
    expect(mocks.pending).not.toHaveBeenCalled()
  })
})
