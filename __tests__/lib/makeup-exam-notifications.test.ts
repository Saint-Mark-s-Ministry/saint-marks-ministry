import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({ recipients: vi.fn(), create: vi.fn(), current: vi.fn(), push: vi.fn(), email: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: mocks.current } } }))
vi.mock('@/lib/notifications', () => ({ sendPushToUser: mocks.push }))
vi.mock('@/lib/mail/send', () => ({ sendEmail: mocks.email, appUrl: () => 'https://app.example.com' }))
import { createMakeupBookingNotifications, deliverMakeupBookingNotifications } from '@/lib/makeup-exam-notifications'
import { makeupExamBooked } from '@/lib/mail/templates'
import type { Prisma } from '@prisma/client'

const joshua = 'coordinator-joshua'
const karen = 'coordinator-karen'
const booking = {
  id: 'booking-1', studentId: 'student-1', examId: 'exam-1', scheduledDate: new Date('2026-11-06T00:00:00Z'),
  student: { name: 'Student Name' },
  exam: { yearLevel: 'YEAR_2' as const, examDate: new Date('2026-10-23T00:00:00Z'), examSection: { displayName: 'Dogma' }, academicYear: { name: '2026-2027' } },
}
const tx = { user: { findMany: mocks.recipients }, notification: { create: mocks.create } } as unknown as Prisma.TransactionClient
const coordinatorRecords = [{ id: joshua, name: 'Joshua Kaisar', email: 'joshua@example.com' }, { id: karen, name: 'Karen Ayoub', email: 'karen@example.com' }]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.recipients.mockResolvedValue(coordinatorRecords.map(({ id }) => ({ id })))
  mocks.current.mockResolvedValue(coordinatorRecords)
  mocks.create.mockImplementation(async ({ data }) => ({ id: `notice-${data.userId}` }))
  mocks.email.mockResolvedValue({ status: 'sent', id: 'message-1' })
  mocks.push.mockResolvedValue(undefined)
})

describe('makeup booking in-app notifications', () => {
  it('targets subscribed users with current Prep staff access', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    expect(mocks.recipients).toHaveBeenCalledWith({ where: {
      makeupExamNotifications: true, isDisabled: false,
      roleAssignments: { some: { revokedAt: null, tag: { in: [RoleTag.SUPER_ADMIN, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.PRIEST] } } },
    }, select: { id: true } })
    expect(notices.map(n => n.userId)).toEqual([joshua, karen])
    expect(mocks.create).toHaveBeenCalledTimes(2)
    expect(mocks.email).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('includes student, exam, Friday, original exam date and a staff booking link', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    expect(notices[0]).toMatchObject({ title: 'Makeup exam scheduled', url: '/dashboard/admin/exams', scheduledDate: 'Fri, Nov 6, 2026' })
    expect(notices[0].body).toContain('Student Name')
    expect(notices[0].body).toContain('Dogma — Year 2 — 2026-2027')
    expect(notices[0].body).toContain('Fri, Oct 23, 2026')
    expect(mocks.create.mock.calls[0][0].data.metadata).toEqual({ kind: 'makeup-exam-booking', bookingId: 'booking-1', studentId: 'student-1', examId: 'exam-1', scheduledDate: '2026-11-06', previousDate: null })
  })

  it('labels reschedules and includes both the previous and new dates', async () => {
    const [notice] = await createMakeupBookingNotifications(tx, booking, new Date('2026-10-30T00:00:00Z'))
    expect(notice.title).toBe('Makeup exam rescheduled')
    expect(notice.body).toContain('from Fri, Oct 30, 2026 to Fri, Nov 6, 2026')
    expect(mocks.create.mock.calls[0][0].data.metadata.previousDate).toBe('2026-10-30')
  })

  it('does not add other staff outside the subscribed recipient lookup', async () => {
    mocks.recipients.mockResolvedValue([{ id: karen }])
    expect((await createMakeupBookingNotifications(tx, booking)).map(n => n.userId)).toEqual([karen])
  })

  it('returns no deliveries when no enabled authorized users subscribe', async () => {
    mocks.recipients.mockResolvedValue([])
    expect(await createMakeupBookingNotifications(tx, booking)).toEqual([])
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('propagates in-app creation failure so the caller can roll back the booking', async () => {
    mocks.create.mockRejectedValue(new Error('Database unavailable'))
    await expect(createMakeupBookingNotifications(tx, booking)).rejects.toThrow('Database unavailable')
  })
})

describe('makeup booking email and push delivery', () => {
  it('delivers email and push to each coordinator using current account contact details', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    await deliverMakeupBookingNotifications(notices)
    expect(mocks.push).toHaveBeenCalledTimes(2)
    expect(mocks.email).toHaveBeenCalledTimes(2)
    expect(mocks.email.mock.calls.map(([m]) => m.to)).toEqual(['joshua@example.com', 'karen@example.com'])
    const message = mocks.email.mock.calls[0][0]
    expect(message.tag).toBe('makeup-exam-booking')
    expect(message.subject).toContain('Student Name')
    expect(message.text).toContain('Fri, Nov 6, 2026')
    expect(message.html).toContain('https://app.example.com/dashboard/admin/exams')
    expect(mocks.push.mock.calls[0][1]).toMatchObject({ notificationId: `notice-${joshua}`, url: '/dashboard/admin/exams' })
  })

  it('rechecks access before external delivery and skips revoked/disabled accounts', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    mocks.current.mockResolvedValue([coordinatorRecords[1]])
    await deliverMakeupBookingNotifications(notices)
    expect(mocks.current.mock.calls[0][0].where).toMatchObject({ isDisabled: false, roleAssignments: { some: { revokedAt: null } } })
    expect(mocks.email).toHaveBeenCalledOnce()
    expect(mocks.email.mock.calls[0][0].to).toBe('karen@example.com')
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(karen, expect.any(Object))
  })

  it('does not let a push failure prevent either email or the other push', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    mocks.push.mockRejectedValueOnce(new Error('Expired subscription'))
    await expect(deliverMakeupBookingNotifications(notices)).resolves.toBeUndefined()
    expect(mocks.email).toHaveBeenCalledTimes(2)
    expect(mocks.push).toHaveBeenCalledTimes(2)
  })

  it('does not let an unexpected email failure prevent the other recipient or push', async () => {
    const notices = await createMakeupBookingNotifications(tx, booking)
    mocks.email.mockRejectedValueOnce(new Error('Network unavailable'))
    await expect(deliverMakeupBookingNotifications(notices)).resolves.toBeUndefined()
    expect(mocks.push).toHaveBeenCalledTimes(2)
    expect(mocks.email).toHaveBeenCalledTimes(2)
  })

  it('escapes student and exam text in email HTML', () => {
    const mail = makeupExamBooked({ name: '<script>staff</script>', studentName: '<img src=x onerror=alert(1)>', examName: '<b>Dogma</b>', scheduledDate: 'Fri, Nov 6, 2026', bookingsUrl: 'https://app.example.com/dashboard/admin/exams' })
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).toContain('&lt;img src=x')
    expect(mail.html).toContain('&lt;b&gt;Dogma&lt;/b&gt;')
    expect(mail.text).toContain('<b>Dogma</b>')
  })
})
