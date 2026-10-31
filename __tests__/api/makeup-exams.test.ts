import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, RoleTag } from '@prisma/client'
import { upcomingMakeupFridays } from '@/lib/makeup-exams'
const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), enrollment: vi.fn(), exams: vi.fn(), bookings: vi.fn(), upsert: vi.fn(), remove: vi.fn(), existing: vi.fn(), transaction: vi.fn(), createNotices: vi.fn(), deliver: vi.fn(), after: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/authorization')>(), getAuthorizationContext: mocks.context }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction, studentEnrollment: { findUnique: mocks.enrollment }, exam: { findMany: mocks.exams }, makeupExamBooking: { findMany: mocks.bookings, findUnique: mocks.existing, upsert: mocks.upsert, deleteMany: mocks.remove } } }))
vi.mock('@/lib/makeup-exam-notifications', () => ({ createMakeupBookingNotifications: mocks.createNotices, deliverMakeupBookingNotifications: mocks.deliver }))
vi.mock('next/server', async importOriginal => ({ ...await importOriginal<typeof import('next/server')>(), after: mocks.after }))
import { GET, POST, DELETE } from '@/app/api/makeup-exams/route'
const request = (body: object) => new Request('http://localhost/api/makeup-exams', { method: 'POST', body: JSON.stringify(body) })

describe('makeup exam API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(async fn => fn({ makeupExamBooking: { findUnique: mocks.existing, upsert: mocks.upsert } }))
    mocks.existing.mockResolvedValue(null)
    mocks.createNotices.mockResolvedValue([])
    mocks.deliver.mockResolvedValue(undefined)
    mocks.auth.mockResolvedValue({ id: 'student' })
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SERVANTS_PREP_STUDENT]), disabled: false, readOnly: false })
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', yearLevel: 'YEAR_1', academicYear: null })
    mocks.exams.mockResolvedValue([{ id: 'exam', scores: [], examSection: { passingScore: 60 } }])
    mocks.bookings.mockResolvedValue([])
    mocks.upsert.mockResolvedValue({ id: 'booking', studentId: 'student', examId: 'exam', scheduledDate: new Date(upcomingMakeupFridays()[0]) })
    mocks.remove.mockResolvedValue({ count: 1 })
  })
  it('scopes students to their own bookings', async () => {
    expect((await GET()).status).toBe(200)
    expect(mocks.bookings.mock.calls[0][0].where).toEqual({ studentId: 'student' })
  })

  it('offers both curriculum years for a yearless async student', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: true, status: 'ACTIVE', isAsyncStudent: true, yearLevel: null, academicYear: null })
    expect((await GET()).status).toBe(200)
    expect(mocks.exams.mock.calls[0][0].where.yearLevel).toEqual({ in: ['YEAR_1', 'YEAR_2', 'BOTH'] })
    expect(mocks.exams.mock.calls[0][0].where.academicYear).toEqual({ isActive: true })
  })
  it('ignores a supplied student ID and reschedules only the authenticated student', async () => {
    expect((await POST(request({ examId: 'exam', studentId: 'someone-else', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(200)
    expect(mocks.upsert.mock.calls[0][0].where).toEqual({ studentId_examId: { studentId: 'student', examId: 'exam' } })
  })
  it('offers failed and missed exams, excluding scores at or above the section threshold', async () => {
    mocks.exams.mockResolvedValue([
      { id: 'failed', scores: [{ percentage: 59 }], examSection: { passingScore: 60 } },
      { id: 'missed', scores: [], examSection: { passingScore: 60 } },
      { id: 'at-threshold', scores: [{ percentage: 60 }], examSection: { passingScore: 60 } },
      { id: 'passed', scores: [{ percentage: 90 }], examSection: { passingScore: 60 } },
      { id: 'higher-threshold', scores: [{ percentage: 70 }], examSection: { passingScore: 75 } },
    ])
    const response = await GET()
    const data = await response.json()
    expect(data.exams.map((exam: { id: string }) => exam.id)).toEqual(['failed', 'missed', 'higher-threshold'])
    expect(data.exams[0]).toMatchObject({ reason: 'FAILED', currentPercentage: 59 })
    expect(data.exams[1]).toMatchObject({ reason: 'MISSED', currentPercentage: null })
    expect(data.exams[0]).not.toHaveProperty('scores')
    expect(mocks.exams.mock.calls[0][0].include.scores).toEqual({ where: { studentId: 'student' }, select: { percentage: true } })
  })
  it('books failed exams and stops offering them after a passing grade is recorded', async () => {
    const exam = { id: 'exam', scores: [{ percentage: 55 }], examSection: { passingScore: 60 } }
    mocks.exams.mockResolvedValue([exam])
    const body = { examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }
    expect((await POST(request(body))).status).toBe(200)
    mocks.upsert.mockClear()
    mocks.exams.mockResolvedValue([{ ...exam, scores: [{ percentage: 60 }] }])
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects dates outside the offered Fridays', async () => {
    expect((await POST(request({ examId: 'exam', scheduledDate: '2020-01-03' }))).status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects exams the student cannot make up', async () => {
    mocks.exams.mockResolvedValue([])
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
  it('rejects inactive students', async () => {
    mocks.enrollment.mockResolvedValue({ isActive: false })
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(400)
  })
  it('allows priests to read but not schedule or cancel', async () => {
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.PRIEST]), disabled: false, readOnly: true })
    expect((await GET()).status).toBe(200)
    expect((await POST(request({}))).status).toBe(403)
    expect((await DELETE(request({ id: 'booking' }))).status).toBe(403)
  })
  it('denies Sunday School-only users and disabled students', async () => {
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SUNDAY_SCHOOL_SERVANT]), disabled: false, readOnly: false })
    expect((await GET()).status).toBe(403)
    mocks.context.mockResolvedValue({ roleTags: new Set([RoleTag.SERVANTS_PREP_STUDENT]), disabled: true, readOnly: false })
    expect((await GET()).status).toBe(403)
  })
  it('cancels only an upcoming booking owned by the current student', async () => {
    expect((await DELETE(request({ id: 'booking' }))).status).toBe(200)
    expect(mocks.remove.mock.calls[0][0].where).toMatchObject({ id: 'booking', studentId: 'student' })
    mocks.remove.mockResolvedValue({ count: 0 })
    expect((await DELETE(request({ id: 'other-booking' }))).status).toBe(404)
  })
  it('commits the booking and in-app notices before queueing external delivery', async () => {
    const deliveries = [{ notificationId: 'notice-1' }]
    mocks.createNotices.mockResolvedValue(deliveries)
    const response = await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))
    expect(response.status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(mocks.createNotices).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: 'booking' }), undefined)
    expect(mocks.after).toHaveBeenCalledOnce()
    expect(mocks.deliver).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.deliver).toHaveBeenCalledExactlyOnceWith(deliveries)
  })

  it('does not update or notify when the same exam is saved for the same Friday', async () => {
    const friday = upcomingMakeupFridays()[0]
    mocks.existing.mockResolvedValue({ id: 'booking', scheduledDate: new Date(friday) })
    expect((await POST(request({ examId: 'exam', scheduledDate: friday }))).status).toBe(200)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.createNotices).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('provides the previous Friday when a booking is rescheduled', async () => {
    const previous = new Date(upcomingMakeupFridays()[0])
    mocks.existing.mockResolvedValue({ id: 'booking', scheduledDate: previous })
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[1] }))).status).toBe(200)
    expect(mocks.createNotices).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ id: 'booking' }), previous)
  })

  it('does not queue external delivery when the booking transaction fails', async () => {
    mocks.transaction.mockRejectedValueOnce(new Error('Database unavailable'))
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(500)
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.deliver).not.toHaveBeenCalled()
  })

  it('retries a serialization conflict and queues just the committed result', async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: '6' }))
    mocks.createNotices.mockResolvedValue([{ notificationId: 'notice-1' }])
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(200)
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.after).toHaveBeenCalledOnce()
  })

  it('suppresses duplicate alerts when a concurrent identical save wins first', async () => {
    mocks.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: '6' }))
    const friday = upcomingMakeupFridays()[0]
    mocks.existing.mockResolvedValue({ id: 'booking', scheduledDate: new Date(friday) })
    expect((await POST(request({ examId: 'exam', scheduledDate: friday }))).status).toBe(200)
    expect(mocks.createNotices).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('returns a retryable conflict after repeated serialization failures', async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: '6' }))
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(409)
    expect(mocks.transaction).toHaveBeenCalledTimes(3)
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('keeps a saved booking successful when external delivery fails afterward', async () => {
    mocks.createNotices.mockResolvedValue([{ notificationId: 'notice-1' }])
    mocks.deliver.mockRejectedValue(new Error('Email unavailable'))
    expect((await POST(request({ examId: 'exam', scheduledDate: upcomingMakeupFridays()[0] }))).status).toBe(200)
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined()
  })

})
