import { RoleTag } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), context: vi.fn(), list: vi.fn(), detail: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  sundaySchoolServantsMeeting: { findMany: mocks.list, findFirst: mocks.detail },
} }))
import { GET } from '@/app/api/sunday-school/servants-meetings/history/route'

const meeting = {
  id: 'old-meeting', date: new Date('2025-10-19'), title: 'Service planning',
  ageGroup: { name: 'Archived group' }, academicYear: { name: '2025-2026' },
  attendance: [{ status: 'PRESENT', servant: { id: 'former', name: 'Former servant' } },
    { status: 'ABSENT', servant: { id: 'other', name: 'Other servant' } }],
}
const get = (params = '') => GET(new Request(`http://localhost/api/sunday-school/servants-meetings/history${params}`))

describe('priest meeting attendance history', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'priest', role: 'PRIEST' })
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.PRIEST]) })
    mocks.list.mockResolvedValue([meeting])
    mocks.detail.mockResolvedValue(meeting)
  })

  it('lets priests browse recorded meetings across years and archived groups without current assignments', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ meetings: [{
      id: meeting.id, date: meeting.date.toISOString(), title: meeting.title,
      ageGroupName: 'Archived group', academicYearName: '2025-2026',
      presentCount: 1, absentCount: 1, recordedCount: 2,
    }], nextCursor: null })
    const query = mocks.list.mock.calls[0][0]
    expect(query.where).toHaveProperty('attendance.some')
    expect(query.where.date.lte).toBeInstanceOf(Date)
    expect(query.where).not.toHaveProperty('academicYearId')
    expect(query.where).not.toHaveProperty('ageGroup')
    expect(query.select.attendance).toEqual({ select: { status: true } })
  })

  it('opens the saved historical roster, including former servants, without contact information', async () => {
    const response = await get('?meetingId=old-meeting')
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.attendance).toEqual([
      { id: 'former', name: 'Former servant', status: 'PRESENT' },
      { id: 'other', name: 'Other servant', status: 'ABSENT' },
    ])
    expect(mocks.detail.mock.calls[0][0].where).toMatchObject({ id: 'old-meeting', attendance: { some: {} } })
    expect(mocks.detail.mock.calls[0][0].select.attendance.select.servant.select).toEqual({ id: true, name: true })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it.each([RoleTag.SUNDAY_SCHOOL_SERVANT, RoleTag.SERVANTS_PREP_SERVANT, RoleTag.PARENT])('denies %s even with a priest session claim', async tag => {
    mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set([tag]) })
    expect((await get()).status).toBe(403)
    expect((await get('?meetingId=old-meeting')).status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.detail).not.toHaveBeenCalled()
  })

  it('denies disabled priests and revoked priest tags', async () => {
    mocks.context.mockResolvedValue({ disabled: true, roleTags: new Set([RoleTag.PRIEST]) })
    expect((await get()).status).toBe(403)
    mocks.context.mockResolvedValue({ disabled: false, roleTags: new Set() })
    expect((await get()).status).toBe(403)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('allows read-only viewing by current admins', async () => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: true, roleTags: new Set([RoleTag.SUPER_ADMIN]) })
    expect((await get()).status).toBe(200)
  })

  it('paginates older meetings without silently truncating history', async () => {
    mocks.list.mockResolvedValue(Array.from({ length: 51 }, (_, index) => ({ ...meeting, id: `meeting-${index}` })))
    const data = await (await get('?cursor=previous-page')).json()
    expect(data.meetings).toHaveLength(50)
    expect(data.nextCursor).toBe('meeting-49')
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      cursor: { id: 'previous-page' }, skip: 1, take: 51, orderBy: [{ date: 'desc' }, { id: 'desc' }],
    }))
  })

  it('returns not found for a missing or future meeting', async () => {
    mocks.detail.mockResolvedValue(null)
    expect((await get('?meetingId=missing')).status).toBe(404)
  })
})
