import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ venue: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/meeting-geofence', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/meeting-geofence')>(), meetingVenue: mocks.venue,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: vi.fn() }))
vi.mock('@/lib/exam-realtime', () => ({ publishExamChange: vi.fn() }))
import { mutateExam, examApiError } from '@/lib/digital-exam-service'

const student = { user: { id: 'student' }, student: true, staff: false, manage: false } as Parameters<typeof mutateExam>[2]
const position = () => ({ latitude: 40.72, longitude: -74.09, accuracy: 10, timestamp: Date.now() })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.venue.mockResolvedValue({ latitude: 40.72, longitude: -74.09 })
  mocks.transaction.mockResolvedValue({ success: true })
})
describe('digital exam location enforcement', () => {
  it.each(['start', 'save', 'submit'])('requires location on %s before any database mutation', async action => {
    await expect(mutateExam('exam', { action }, student)).rejects.toMatchObject({ status: 400 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['start', 'save', 'submit'])('refuses out-of-bounds %s', async action => {
    await expect(mutateExam('exam', { action, position: { ...position(), latitude: 40.73 } }, student)).rejects.toMatchObject({ status: 403 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['start', 'save', 'submit'])('allows a fresh in-bounds %s to reach existing transaction checks', async action => {
    await mutateExam('exam', { action, position: position() }, student)
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })
  it.each([
    { accuracy: 101 }, { latitude: 91 }, { timestamp: 0 }, { timestamp: Date.now() + 60000 },
  ])('refuses invalid or stale position %o', async override => {
    await expect(mutateExam('exam', { action: 'start', position: { ...position(), ...override } }, student)).rejects.toMatchObject({ status: 400 })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.venue).not.toHaveBeenCalled()
  })
  it('fails closed with a retryable response when venue lookup is unavailable', async () => {
    mocks.venue.mockRejectedValue(new Error('Lookup unavailable'))
    try {
      await mutateExam('exam', { action: 'submit', position: position() }, student)
      throw new Error('Expected rejection')
    } catch (error) {
      expect(examApiError(error).status).toBe(503)
    }
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['heartbeat', 'events'])('keeps %s reporting available without location', async action => {
    await mutateExam('exam', { action }, student)
    expect(mocks.venue).not.toHaveBeenCalled()
    expect(mocks.transaction).toHaveBeenCalledOnce()
  })
  it('keeps proctor actions independent of location and denies unauthorized callers', async () => {
    await mutateExam('exam', { action: 'close' }, { ...student, staff: true, manage: true, student: false })
    expect(mocks.venue).not.toHaveBeenCalled()
    mocks.transaction.mockClear()
    await expect(mutateExam('exam', { action: 'start', position: position() }, { ...student, student: false })).rejects.toThrow('Forbidden')
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})
