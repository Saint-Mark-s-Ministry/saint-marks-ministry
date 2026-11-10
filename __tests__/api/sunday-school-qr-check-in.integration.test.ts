// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { UserRole } from '@prisma/client'

const auth = vi.hoisted(() => ({ user: { id: '', role: 'SERVANT', authVersion: 1 } as { id: string; role: string; authVersion: number } | null }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: async () => { if (!auth.user) throw new Error('Unauthorized'); return auth.user } }))
vi.mock('@/lib/attendance-audit', () => ({ recordAttendanceAudit: vi.fn() }))
import { prisma } from '@/lib/prisma'
import { GET as scan, POST as checkIn } from '@/app/api/public/attendance-check-in/route'
import { POST as manage } from '@/app/api/sunday-school/attendance/check-in/route'
import { POST as saveAttendance } from '@/app/api/sunday-school/attendance/batch/route'
import { finishAttendanceWithCheckIn } from '@/lib/sunday-school-attendance-check-in'

let managerVersion = 1
let fixturesStarted = false
const enabled = process.env.RUN_QR_ATTENDANCE_INTEGRATION === '1'
const suite = enabled ? describe : describe.skip
const prefix = `qr-test-${randomUUID()}`
const ids = { manager: `${prefix}-manager`, childUser: `${prefix}-user`, outsider: `${prefix}-outsider`, parent: `${prefix}-parent`, child: `${prefix}-child`, peer: `${prefix}-peer`, classroom: `${prefix}-class`, secondClass: `${prefix}-other`, year: `${prefix}-year` }
const json = (url: string, body: unknown) => new Request(`http://localhost${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost' }, body: JSON.stringify(body) })
const manager = () => { auth.user = { id: ids.manager, role: 'SUPER_ADMIN', authVersion: managerVersion } }
const confirm = (childIds = [ids.child]) => { manager(); return manage(json('/api/sunday-school/attendance/check-in', { classId: ids.classroom, date: '2026-11-14', action: 'approve', childIds })) }
async function open(classId = ids.classroom, date = '2026-11-14') {
  manager()
  const response = await manage(json('/api/sunday-school/attendance/check-in', { classId, date, action: 'open' }))
  expect(response.status).toBe(200)
  return response.json() as Promise<{ token: string; sessionId: string }>
}
const post = (token: string, firstName = 'Synthetic', lastName = 'Child') => checkIn(json('/api/public/attendance-check-in', { token, name: `${firstName} ${lastName}` }))
const get = (token: string) => scan(new Request('http://localhost/api/public/attendance-check-in', { headers: { 'X-Attendance-Check-In': token } }))

suite('QR attendance against isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!new URL(process.env.SP_DATABASE_URL ?? '').hostname.startsWith('ep-proud-mud-adwjljup')) throw new Error('QR integration tests require the named isolated Neon branch')
    fixturesStarted = true
    await prisma.academicYear.create({ data: { id: ids.year, name: ids.year, startDate: new Date('2026-09-01'), endDate: new Date('2027-08-31') } })
    for (const [id, role] of [[ids.manager, UserRole.SUPER_ADMIN], [ids.childUser, UserRole.SERVANT], [ids.outsider, UserRole.SERVANT_PREP], [ids.parent, UserRole.PARENT]] as const) {
      await prisma.user.create({ data: { id, name: 'Synthetic QR tester', email: `${id}@example.invalid`, password: 'not-a-login-password', role, mustChangePassword: false } })
    }
    for (const id of [ids.classroom, ids.secondClass]) await prisma.sundaySchoolClass.create({ data: { id, name: id, level: 'GRADE_1', academicYearId: ids.year } })
    await prisma.sundaySchoolChild.create({ data: { id: ids.child, firstName: 'Synthetic', lastName: 'Child', level: 'GRADE_1', classId: ids.classroom, userId: ids.childUser } })
    await prisma.sundaySchoolChild.create({ data: { id: ids.peer, firstName: 'Synthetic', lastName: 'Peer', level: 'GRADE_1', classId: ids.classroom } })
    await prisma.sundaySchoolChildGuardian.create({ data: { parentId: ids.parent, childId: ids.child } })
  }, 30000)
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-14T16:00:00Z'))
    await prisma.sundaySchoolSession.deleteMany({ where: { classId: { in: [ids.classroom, ids.secondClass] } } })
    await prisma.sundaySchoolChild.update({ where: { id: ids.child }, data: { classId: ids.classroom, isActive: true } })
    await prisma.sundaySchoolChild.update({ where: { id: ids.peer }, data: { firstName: 'Synthetic', lastName: 'Peer' } })
    const updatedManager = await prisma.user.update({ where: { id: ids.manager }, data: { isDisabled: false, role: 'SUPER_ADMIN' } })
    managerVersion = updatedManager.authVersion
    manager()
  })
  afterAll(async () => {
    vi.useRealTimers()
    if (!fixturesStarted) return
    // Only this run's synthetic fixtures; copied production rows are untouched.
    await prisma.sundaySchoolSession.deleteMany({ where: { classId: { in: [ids.classroom, ids.secondClass] } } })
    await prisma.sundaySchoolChildGuardian.deleteMany({ where: { childId: { in: [ids.child, ids.peer] } } })
    await prisma.sundaySchoolChild.deleteMany({ where: { id: { in: [ids.child, ids.peer] } } })
    await prisma.sundaySchoolClass.deleteMany({ where: { id: { in: [ids.classroom, ids.secondClass] } } })
    await prisma.academicYear.deleteMany({ where: { id: ids.year } })
    await prisma.user.deleteMany({ where: { id: { in: [ids.manager, ids.childUser, ids.outsider, ids.parent] } } })
    await prisma.$disconnect()
  }, 30000)
  it('accepts names without accounts, exposes no roster, and waits for staff confirmation', async () => {
    const { token, sessionId } = await open(); auth.user = null
    const page = await (await get(token)).json()
    expect(page.state).toBe('open'); expect(page.className).toBe(ids.classroom)
    expect(JSON.stringify(page)).not.toMatch(/children|guardian|phone|email|password|tokenHash/)
    const responses = await Promise.all([post(token), post(token)])
    expect(responses.map(r => r.status)).toEqual([200, 200])
    expect(await prisma.sundaySchoolAttendanceCheckInRequest.count({ where: { sessionId } })).toBe(1)
    expect(await prisma.sundaySchoolChildAttendance.count({ where: { sessionId } })).toBe(0)
    expect((await confirm()).status).toBe(200)
    expect((await confirm()).status).toBe(200)
    const row = await prisma.sundaySchoolChildAttendance.findUniqueOrThrow({ where: { sessionId_childId: { sessionId, childId: ids.child } } })
    expect(row.status).toBe('PRESENT'); expect(row.selfCheckedInAt).not.toBeNull(); expect(row.recordedBy).toBe(ids.manager)
  }, 30000)
  it('returns identical acknowledgements for unknown, duplicate and ambiguous names', async () => {
    const { token, sessionId } = await open(); auth.user = null
    const known = await (await post(token)).json()
    const missing = await (await post(token, 'Not', 'On Roster')).json()
    expect(missing).toEqual(known)
    expect(await (await post(token)).json()).toEqual(known)
    await prisma.sundaySchoolChild.update({ where: { id: ids.peer }, data: { firstName: 'Synthetic', lastName: 'Child' } })
    const second = await open(ids.secondClass)
    expect(await (await post(second.token)).json()).toEqual(known)
    expect(await prisma.sundaySchoolAttendanceCheckInRequest.count({ where: { sessionId: second.sessionId } })).toBe(0)
    // A fresh meeting with two exact names queues neither, and discloses neither.
    await prisma.sundaySchoolAttendanceCheckInRequest.deleteMany({ where: { sessionId } })
    expect(await (await post(token)).json()).toEqual(known)
    expect(await prisma.sundaySchoolAttendanceCheckInRequest.count({ where: { sessionId } })).toBe(0)
  }, 30000)
  it('enforces scheduled windows, code replacement, separate meetings and meeting days', async () => {
    const first = await open(); const second = await open(); auth.user = null
    expect((await post(first.token)).status).toBe(410)
    vi.setSystemTime(new Date('2026-11-14T15:29:59Z')); expect((await post(second.token)).status).toBe(410)
    expect((await (await get(second.token)).json()).state).toBe('upcoming')
    vi.setSystemTime(new Date('2026-11-14T17:30:00Z')); expect((await post(second.token)).status).toBe(410)
    vi.setSystemTime(new Date('2026-11-21T16:00:00Z')); expect((await post(second.token)).status).toBe(410)
    const next = await open(ids.classroom, '2026-11-21'); expect(next.token).not.toBe(second.token); expect(next.sessionId).not.toBe(second.sessionId)
    manager(); expect((await manage(json('/api/sunday-school/attendance/check-in', { classId: ids.classroom, date: '2026-11-22', action: 'open' }))).status).toBe(409)
  }, 30000)
  it('denies unauthorized reviewers, disabled issuers, moved children and cross-origin writes', async () => {
    const { token, sessionId } = await open(); await post(token)
    auth.user = { id: ids.outsider, role: 'SERVANT_PREP', authVersion: 1 }
    const action = { classId: ids.classroom, date: '2026-11-14', action: 'approve', childIds: [ids.child] }
    expect((await manage(json('/api/sunday-school/attendance/check-in', action))).status).toBe(403)
    await prisma.sundaySchoolChild.update({ where: { id: ids.child }, data: { classId: ids.secondClass } })
    expect((await confirm()).status).toBe(200); expect(await prisma.sundaySchoolChildAttendance.count({ where: { sessionId } })).toBe(0)
    await prisma.user.update({ where: { id: ids.manager }, data: { isDisabled: true } }); expect((await post(token)).status).toBe(410)
    const request = new Request('http://localhost/api/public/attendance-check-in', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://other.invalid' }, body: JSON.stringify({ token, name: 'Synthetic Child' }) })
    expect((await checkIn(request)).status).toBe(403)
  }, 30000)
  it('protects confirmed QR marks from stale autosaves and permits reviewed manual corrections', async () => {
    const { token, sessionId } = await open(); await post(token); await confirm()
    const row = await prisma.sundaySchoolChildAttendance.findUniqueOrThrow({ where: { sessionId_childId: { sessionId, childId: ids.child } } })
    manager(); const payload = { sessionId, records: [{ childId: ids.child, status: 'ABSENT' }] }
    expect((await saveAttendance(json('/api/sunday-school/attendance/batch', payload))).status).toBe(409)
    expect((await saveAttendance(json('/api/sunday-school/attendance/batch', { ...payload, records: [{ ...payload.records[0], expectedSelfCheckedInAt: row.selfCheckedInAt!.toISOString() }] }))).status).toBe(200)
    const changed = await prisma.sundaySchoolChildAttendance.findUniqueOrThrow({ where: { sessionId_childId: { sessionId, childId: ids.child } } })
    expect(changed.status).toBe('ABSENT'); expect(changed.selfCheckedInAt).toBeNull()
  }, 30000)
  it('serializes a name submission racing with Finish without losing pending requests', async () => {
    const { token, sessionId } = await open(); auth.user = null
    const [scanResult, finishResult] = await Promise.allSettled([
      post(token), finishAttendanceWithCheckIn(sessionId, ids.manager, [{ childId: ids.child, status: 'ABSENT' }], []),
    ])
    expect(scanResult.status).toBe('fulfilled')
    if (scanResult.status !== 'fulfilled') return
    if (scanResult.value.status === 200) {
      expect(finishResult.status).toBe('rejected')
      expect(await prisma.sundaySchoolAttendanceCheckInRequest.count({ where: { sessionId, reviewedAt: null } })).toBe(1)
    } else { expect(scanResult.value.status).toBe(410); expect(finishResult.status).toBe('fulfilled') }
  }, 30000)
  it('requires request review before Finish, preserves unseen QR marks and closes scans', async () => {
    const { token, sessionId } = await open(); await post(token)
    const records = [{ childId: ids.child, status: 'ABSENT' as const }, { childId: ids.peer, status: 'ABSENT' as const }]
    await expect(finishAttendanceWithCheckIn(sessionId, ids.manager, records, [])).rejects.toThrow('Review the waiting QR requests')
    await confirm()
    await finishAttendanceWithCheckIn(sessionId, ids.manager, records, [])
    expect((await post(token)).status).toBe(410)
    await finishAttendanceWithCheckIn(sessionId, ids.manager, records, [ids.child, ids.peer])
    const row = await prisma.sundaySchoolChildAttendance.findUniqueOrThrow({ where: { sessionId_childId: { sessionId, childId: ids.child } } }); expect(row.status).toBe('PRESENT'); expect(row.selfCheckedInAt).not.toBeNull()
  }, 30000)
})
