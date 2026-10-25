import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ session: vi.fn(), user: vi.fn(), cls: vi.fn(), access: vi.fn(), lessons: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: mocks.user }, sundaySchoolClass: { findUnique: mocks.cls }, sundaySchoolWeeklyLesson: { findMany: mocks.lessons } } }))
vi.mock('@/lib/sunday-school-access', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sunday-school-access')>('@/lib/sunday-school-access')
  return { ...actual, getSundaySchoolAccess: mocks.access }
})

import { POST } from '@/app/api/sunday-school/classes/[id]/lesson-calendar/route'
import { GET } from '@/app/api/public/lesson-calendar/[token]/route'
import { createLessonCalendarToken } from '@/lib/sunday-school-lesson-calendar'

const user = { id: 'servant-1', role: 'SERVANT', authVersion: 2, isDisabled: false, mustChangePassword: false }
const cls = { id: 'class-1', name: '10th Grade', classroom: '213', academicYearId: 'year-1', isActive: true,
  academicYear: { endDate: new Date('2099-09-01T00:00:00Z') }, updatedAt: new Date('2026-10-01T00:00:00Z') }
const token = () => createLessonCalendarToken({ userId: user.id, classId: cls.id, authVersion: 2, expiresAt: Date.UTC(2099, 0, 1) })
const mint = () => POST(new Request('https://stmarkministry.app/api/sunday-school/classes/class-1/lesson-calendar', { method: 'POST' }), { params: Promise.resolve({ id: cls.id }) })
const feed = (credential = `${token()}.ics`) => GET(new Request(`https://stmarkministry.app/api/public/lesson-calendar/${credential}`), { params: Promise.resolve({ token: credential }) })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXTAUTH_SECRET', 'calendar-route-test-secret')
  vi.stubEnv('NEXTAUTH_URL', 'https://stmarkministry.app')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.session.mockResolvedValue({ user })
  mocks.user.mockResolvedValue(user)
  mocks.cls.mockResolvedValue(cls)
  mocks.access.mockResolvedValue({ canRead: true, visibleClassIds: new Set([cls.id]) })
  mocks.lessons.mockResolvedValue([{ id: 'lesson-1', title: 'Faith', sundayDate: new Date('2026-10-25T00:00:00Z'), updatedAt: new Date('2026-10-23T00:00:00Z') }])
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('lesson calendar link creation', () => {
  it('creates a scoped private feed only after rechecking database authority', async () => {
    const response = await mint()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body.className).toBe('10th Grade')
    expect(body.feedUrl).toMatch(/^https:\/\/stmarkministry.app\/api\/public\/lesson-calendar\/.+\.ics$/)
    expect(mocks.access).toHaveBeenCalledWith(user, cls.academicYearId)
  })
  it('denies unauthenticated and impersonated sessions', async () => {
    mocks.session.mockResolvedValue(null)
    expect((await mint()).status).toBe(401)
    mocks.session.mockResolvedValue({ user, impersonating: { id: 'admin-1' } })
    expect((await mint()).status).toBe(403)
    expect(mocks.user).not.toHaveBeenCalled()
  })
  it('denies an unrelated class and prep-only access', async () => {
    mocks.access.mockResolvedValue({ canRead: false, visibleClassIds: new Set() })
    expect((await mint()).status).toBe(403)
    mocks.access.mockResolvedValue({ canRead: true, visibleClassIds: new Set(['other-class']) })
    expect((await mint()).status).toBe(403)
  })
  it('rejects revoked sessions and password-change requirements', async () => {
    mocks.user.mockResolvedValue({ ...user, authVersion: 3 })
    expect((await mint()).status).toBe(401)
    mocks.user.mockResolvedValue({ ...user, mustChangePassword: true })
    expect((await mint()).status).toBe(403)
  })
})

describe('subscribed lesson feeds', () => {
  it('works without browser cookies and queries only this class and allowed lesson fields', async () => {
    const response = await feed()
    expect(response.status).toBe(200)
    expect(mocks.session).not.toHaveBeenCalled()
    expect(response.headers.get('content-type')).toContain('text/calendar')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.lessons).toHaveBeenCalledWith({ where: { classId: cls.id }, orderBy: { sundayDate: 'asc' }, select: { id: true, title: true, sundayDate: true, updatedAt: true } })
    expect(await response.text()).toContain('SUMMARY:10th Grade: Faith')
  })
  it('rejects bad credentials before querying the database', async () => {
    expect((await feed('invalid.ics')).status).toBe(404)
    expect(mocks.user).not.toHaveBeenCalled()
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
  it.each([{ isDisabled: true }, { authVersion: 3 }, { mustChangePassword: true }])('revokes the feed when account security changes: %j', async changed => {
    mocks.user.mockResolvedValue({ ...user, ...changed })
    expect((await feed()).status).toBe(404)
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
  it('revokes a former servant’s link after class assignment removal', async () => {
    mocks.access.mockResolvedValue({ canRead: true, visibleClassIds: new Set() })
    expect((await feed()).status).toBe(404)
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
  it('does not expose an archived or deleted class', async () => {
    mocks.cls.mockResolvedValue({ ...cls, isActive: false })
    expect((await feed()).status).toBe(404)
    expect(mocks.lessons).not.toHaveBeenCalled()
  })
})
