// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), manager: vi.fn(), audit: vi.fn(), transaction: vi.fn(), lock: vi.fn(),
  session: vi.fn(), existingQr: vi.fn(), saveQr: vi.fn(), closeQr: vi.fn(),
  pending: vi.fn(), attendance: vi.fn(), addAttendance: vi.fn(), review: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/audit', () => ({ recordAuditEvent: mocks.audit }))
vi.mock('@/lib/api-utils', () => ({ handleApiError: (error: Error) => NextResponse.json({ error: error.message }, { status: 500 }) }))
vi.mock('@/lib/sunday-school-attendance-check-in', () => ({
  CheckInError: class extends Error { constructor(message: string, readonly status: number) { super(message) } },
  requireCheckInManager: mocks.manager, lockCheckInSession: mocks.lock,
  newCheckInToken: () => 'private-bearer-code', hashCheckInToken: () => 'private-code-hash',
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolSession: { upsert: mocks.session, findUnique: mocks.session },
  $transaction: mocks.transaction,
} }))
import { CheckInError } from '@/lib/sunday-school-attendance-check-in'
import { POST } from '@/app/api/sunday-school/attendance/check-in/route'
const tx = {
  sundaySchoolAttendanceCheckIn: { findUnique: mocks.existingQr, upsert: mocks.saveQr, updateMany: mocks.closeQr },
  sundaySchoolAttendanceCheckInRequest: { findMany: mocks.pending, updateMany: mocks.review },
  sundaySchoolChildAttendance: { findMany: mocks.attendance, createMany: mocks.addAttendance },
}
function request(action: string, extra = {}) {
  return new Request('http://localhost/api/sunday-school/attendance/check-in', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
    body: JSON.stringify({ classId: 'class', date: '2026-11-14', action, ...extra }),
  })
}
const metadata = { classId: 'class', targetName: 'Grade 3', attendanceDate: '2026-11-14' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-14T16:00:00Z'))
  mocks.auth.mockResolvedValue({ id: 'servant', authVersion: 1 })
  mocks.manager.mockResolvedValue({ user: { id: 'servant', authVersion: 1 }, classroom: { id: 'class', name: 'Grade 3', level: 'GRADE_1' } })
  mocks.session.mockResolvedValue({ id: 'meeting' })
  mocks.existingQr.mockResolvedValue(null)
  mocks.closeQr.mockResolvedValue({ count: 1 })
  mocks.pending.mockResolvedValue(['child-1', 'child-2'].map(childId => ({ id: `request-${childId}`, childId, submittedAt: new Date() })))
  mocks.attendance.mockResolvedValue([])
  mocks.addAttendance.mockResolvedValue({ count: 2 })
  mocks.transaction.mockImplementation(async callback => {
    const result = await callback(tx)
    // Activity describes committed actions, never a partial transaction.
    expect(mocks.audit).not.toHaveBeenCalled()
    return result
  })
})
afterEach(() => vi.useRealTimers())

describe('Sunday School QR activity', () => {
  it.each([false, true])('distinguishes creation from replacement (existing QR: %s)', async exists => {
    mocks.existingQr.mockResolvedValue(exists ? { id: 'qr' } : null)
    const response = await POST(request('open'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ token: 'private-bearer-code' })
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      actorUserId: 'servant', action: `sunday_school.attendance_qr.${exists ? 'replaced' : 'created'}`,
      entityType: 'SundaySchoolSession', entityId: 'meeting', result: 'SUCCESS',
      metadata: { ...metadata, opensAt: '2026-11-14T15:30:00.000Z', expiresAt: '2026-11-14T17:30:00.000Z' },
    })
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(/private-bearer|private-code-hash|token|childIds/)
  })
  it('logs closing an open QR', async () => {
    expect((await POST(request('close'))).status).toBe(200)
    expect(mocks.closeQr).toHaveBeenCalledWith({ where: { sessionId: 'meeting', closedAt: null }, data: { closedAt: expect.any(Date) } })
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ action: 'sunday_school.attendance_qr.closed', metadata }))
  })
  it('does not report closing an already closed or absent QR', async () => {
    mocks.closeQr.mockResolvedValue({ count: 0 })
    expect((await POST(request('close'))).status).toBe(200)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('counts reviewed requests separately from attendance actually added', async () => {
    mocks.attendance.mockResolvedValue([{ childId: 'child-1' }])
    mocks.addAttendance.mockResolvedValue({ count: 1 })
    const response = await POST(request('approve', { childIds: ['child-1', 'child-2'] }))
    expect(await response.json()).toEqual({ confirmed: true, added: 1 })
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      actorUserId: 'servant', action: 'sunday_school.attendance_qr.approved',
      metadata: { ...metadata, requestCount: 2, attendanceAddedCount: 1 },
    }))
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain('child-1')
  })
  it('records confirmation even if all children already have attendance marks', async () => {
    mocks.attendance.mockResolvedValue([{ childId: 'child-1' }, { childId: 'child-2' }])
    expect((await POST(request('approve', { childIds: ['child-1', 'child-2'] }))).status).toBe(200)
    expect(mocks.addAttendance).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ metadata: { ...metadata, requestCount: 2, attendanceAddedCount: 0 } }))
  })
  it('logs dismissal without creating attendance', async () => {
    expect((await POST(request('reject', { childIds: ['child-1', 'child-2'] }))).status).toBe(200)
    expect(mocks.addAttendance).not.toHaveBeenCalled()
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      action: 'sunday_school.attendance_qr.dismissed', metadata: { ...metadata, requestCount: 2, attendanceAddedCount: 0 },
    }))
  })
  it('does not duplicate activity for requests that have already been reviewed', async () => {
    mocks.pending.mockResolvedValue([])
    expect((await POST(request('approve', { childIds: ['child-1'] }))).status).toBe(200)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it.each(['Unauthorized', 'stale session', 'expired window', 'failed write'])('does not record success after %s', async scenario => {
    if (scenario === 'Unauthorized') mocks.manager.mockRejectedValue(new CheckInError('Forbidden', 403))
    if (scenario === 'stale session') mocks.auth.mockResolvedValue({ id: 'servant', authVersion: 0 })
    if (scenario === 'expired window') vi.setSystemTime(new Date('2026-11-14T18:00:00Z'))
    if (scenario === 'failed write') mocks.saveQr.mockRejectedValue(new Error('Database unavailable'))
    expect((await POST(request('open'))).status).toBeGreaterThanOrEqual(400)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
