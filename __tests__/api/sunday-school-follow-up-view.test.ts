import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), session: vi.fn(), classes: vi.fn(), sessions: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/notifications', () => ({ notifyPriestNoteCreated: vi.fn(), notifySundaySchoolAbsence: vi.fn() }))
vi.mock('@/lib/sunday-school-access', () => ({
  getSundaySchoolAccess: vi.fn().mockResolvedValue({ isAdmin: false, canRead: true, readOnly: false }),
  visibleClassFilter: vi.fn().mockReturnValue(['class-1']),
  canServeClass: vi.fn().mockReturnValue(true),
  canViewClass: vi.fn().mockReturnValue(true),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { sundaySchoolClass: { findMany: mocks.classes }, sundaySchoolSession: { findMany: mocks.sessions } } }))
import { GET } from '@/app/api/sunday-school/visitations/route'

const child = (id: string, priority = false) => ({ id, firstName: id, lastName: 'Child', visitationPriority: priority, visitations: [], phoneCalls: [] })
const absent = (date: string, childId: string) => ({ classId: 'class-1', date: new Date(`${date}T00:00:00Z`), attendance: [{ childId }] })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-22T15:00:00Z')) // Thursday; the last Elementary meeting was Sat Oct 17
  mocks.auth.mockResolvedValue({ id: 'servant' })
  mocks.session.mockResolvedValue({})
  mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set([RoleTag.SUNDAY_SCHOOL_SERVANT]) })
  mocks.classes.mockResolvedValue([{ id: 'class-1', name: 'Grade 3', level: 'GRADE_3', children: [child('missing'), child('starred', true), child('fine'), child('two-weeks')] }])
  mocks.sessions.mockResolvedValue([
    absent('2026-10-17', 'missing'), absent('2026-10-10', 'missing'), absent('2026-10-03', 'missing'),
    absent('2026-10-17', 'two-weeks'), absent('2026-10-10', 'two-weeks'),
  ])
})
afterEach(() => vi.useRealTimers())

describe('visitations ?view=follow-up', () => {
  it('returns only children absent 3+ meetings in a row or starred, each with their streak', async () => {
    const body = await (await GET(new Request('http://localhost/api/sunday-school/visitations?view=follow-up'))).json()
    expect(body.classes[0].children.map((c: { id: string }) => c.id)).toEqual(['missing', 'starred'])
    expect(body.classes[0].children[0].absentStreak).toEqual({ weeks: 3, since: '2026-10-03' })
  })

  it('loads only the latest call and completed visit, and never their notes', async () => {
    await GET(new Request('http://localhost/api/sunday-school/visitations?view=follow-up'))
    const select = mocks.classes.mock.calls[0][0].select.children.select
    expect(select.visitations).toMatchObject({ take: 1, where: { status: 'DONE' } })
    expect(select.phoneCalls).toMatchObject({ take: 1 })
    expect(select.visitations.select).not.toHaveProperty('notes')
    expect(select.phoneCalls.select).not.toHaveProperty('note')
  })

  it('keeps every child and full history for Visits & calls', async () => {
    const body = await (await GET(new Request('http://localhost/api/sunday-school/visitations'))).json()
    expect(body.classes[0].children).toHaveLength(4)
    expect(mocks.classes.mock.calls[0][0].select.children.select.visitations.select).toHaveProperty('notes')
  })
})
