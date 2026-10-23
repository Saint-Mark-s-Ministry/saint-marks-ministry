// @vitest-environment node
// Opt in only against an isolated database: CHECK_IN_TEST_DATABASE_URL must match SP_DATABASE_URL.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'

const auth = vi.hoisted(() => ({ user: { id: '', role: 'SERVANT', name: 'Check-in test' } }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: vi.fn(async () => auth.user) }))
import { POST as logCall } from '@/app/api/sunday-school/phone-calls/route'
import { GET, PUT } from '@/app/api/sunday-school/follow-up-assignments/route'
import { getCheckInWeek } from '@/lib/sunday-school-check-ins'

const enabled = process.env.RUN_CHECK_IN_DB_TESTS === '1'
describe.skipIf(!enabled)('check-in database and API workflow', () => {
  const db = new PrismaClient()
  const key = `check-in-${crypto.randomUUID()}`
  let servantId: string, priestId: string, outsiderId: string, classId: string, otherClassId: string, childId: string, assignmentId: string, otherAssignmentId: string
  const req = (body: unknown) => new Request('http://localhost/api/sunday-school/follow-up-assignments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const read = () => GET(new Request(`http://localhost/api/sunday-school/follow-up-assignments?classId=${classId}`))

  beforeAll(async () => {
    if (!process.env.CHECK_IN_TEST_DATABASE_URL || process.env.CHECK_IN_TEST_DATABASE_URL !== process.env.SP_DATABASE_URL) throw new Error('Use the same isolated database for SP_DATABASE_URL and CHECK_IN_TEST_DATABASE_URL')
    const year = await db.academicYear.findFirstOrThrow({ where: { isActive: true } })
    const servant = await db.user.create({ data: { name: 'Check-in fixture servant', email: `${key}@example.invalid`, password: 'unused', role: 'SERVANT', roleAssignments: { create: { source: 'SYSTEM', tag: 'SUNDAY_SCHOOL_SERVANT' } } } })
    servantId = servant.id
    priestId = (await db.user.create({ data: { name: 'Check-in fixture priest', email: `${key}-priest@example.invalid`, password: 'unused', role: 'PRIEST', roleAssignments: { create: { source: 'SYSTEM', tag: 'PRIEST' } } } })).id
    outsiderId = (await db.user.create({ data: { name: 'Check-in fixture prep', email: `${key}-prep@example.invalid`, password: 'unused', role: 'SERVANT_PREP', roleAssignments: { create: { source: 'SYSTEM', tag: 'SERVANTS_PREP_SERVANT' } } } })).id
    classId = (await db.sundaySchoolClass.create({ data: { name: key, level: 'GRADE_1', academicYearId: year.id } })).id
    otherClassId = (await db.sundaySchoolClass.create({ data: { name: `${key}-other`, level: 'GRADE_2', academicYearId: year.id } })).id
    assignmentId = (await db.sundaySchoolServantAssignment.create({ data: { classId, userId: servantId, academicYearId: year.id, authority: 'SERVANT' } })).id
    otherAssignmentId = (await db.sundaySchoolServantAssignment.create({ data: { classId: otherClassId, userId: outsiderId, academicYearId: year.id, authority: 'SERVANT' } })).id
    childId = (await db.sundaySchoolChild.create({ data: { firstName: 'Check-in', lastName: 'Fixture', level: 'GRADE_1', classId } })).id
  })

  beforeEach(async () => {
    auth.user = { id: servantId, role: 'SERVANT', name: 'Fixture servant' }
    await db.sundaySchoolChild.update({ where: { id: childId }, data: { classId, followUpAssignmentId: null } })
    await db.sundaySchoolServantAssignment.update({ where: { id: assignmentId }, data: { endedAt: null } })
    await db.user.update({ where: { id: servantId }, data: { isDisabled: false } })
    await db.sundaySchoolPhoneCall.deleteMany({ where: { childId } })
  })

  afterAll(async () => {
    const users = [servantId, priestId, outsiderId].filter(Boolean)
    if (users.length) await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } })
    if (childId) await db.sundaySchoolChild.deleteMany({ where: { id: childId } })
    if (users.length) await db.sundaySchoolServantAssignment.deleteMany({ where: { userId: { in: users } } })
    const classes = [classId, otherClassId].filter(Boolean)
    if (classes.length) await db.sundaySchoolClass.deleteMany({ where: { id: { in: classes } } })
    if (users.length) await db.userRoleAssignment.deleteMany({ where: { userId: { in: users } } })
    if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })
    await db.$disconnect()
  })

  it('persists assignment, reassignment clearing and audit records', async () => {
    expect((await PUT(req({ childId, assignmentId }))).status).toBe(200)
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: childId } })).followUpAssignmentId).toBe(assignmentId)
    const data = await (await read()).json()
    expect(data.classes[0].children[0].assignee.id).toBe(servantId)
    expect((await PUT(req({ childId, assignmentId: null }))).status).toBe(200)
    expect((await db.sundaySchoolChild.findUniqueOrThrow({ where: { id: childId } })).followUpAssignmentId).toBeNull()
    expect(await db.auditEvent.count({ where: { actorUserId: servantId, entityId: childId, action: 'sunday_school.child_follow_up.assign' } })).toBe(2)
  })

  it('counts an attempted call only in this class and current week', async () => {
    const { start } = getCheckInWeek()
    const previous = new Date(start.getTime() - 86400000)
    await db.sundaySchoolPhoneCall.createMany({ data: [
      { classId, childId, callerName: 'Fixture', calledAt: previous, outcome: 'CONNECTED', note: 'Old week' },
      { classId: otherClassId, childId, callerName: 'Fixture', calledAt: start, outcome: 'CONNECTED', note: 'Other class' },
    ] })
    expect((await (await read()).json()).classes[0].children[0].callThisWeek).toBeNull()
    await db.sundaySchoolPhoneCall.create({ data: { classId, childId, callerName: 'Fixture', calledAt: start, outcome: 'NO_ANSWER', note: 'Attempted this week' } })
    const data = await (await read()).json()
    expect(data.classes[0].children[0].callThisWeek.outcome).toBe('NO_ANSWER')
    expect(JSON.stringify(data)).not.toContain('Attempted this week')
  })

  it('logs a call using the current database caller and immediately updates the week status', async () => {
    const response = await logCall(new Request('http://localhost/api/sunday-school/phone-calls', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ childId, calledAt: getCheckInWeek().today.toISOString().slice(0, 10), outcome: 'LEFT_VOICEMAIL', note: 'Local fixture call' }),
    }))
    expect(response.status).toBe(201)
    const call = await response.json()
    expect(call.callerName).toBe('Check-in fixture servant')
    const data = await (await read()).json()
    expect(data.classes[0].children[0].callThisWeek.outcome).toBe('LEFT_VOICEMAIL')
  })

  it('rejects another class’s assignee and inactive staffing', async () => {
    expect((await PUT(req({ childId, assignmentId: otherAssignmentId }))).status).toBe(400)
    await db.sundaySchoolServantAssignment.update({ where: { id: assignmentId }, data: { endedAt: new Date() } })
    expect((await PUT(req({ childId, assignmentId }))).status).toBe(403) // caller lost their class scope too
  })

  it('hides responsibility after transfer or disabled staffing', async () => {
    await db.sundaySchoolChild.update({ where: { id: childId }, data: { followUpAssignmentId: assignmentId, classId: otherClassId } })
    auth.user = { id: priestId, role: 'PRIEST', name: 'Fixture priest' }
    const transferred = await (await GET(new Request(`http://localhost/api/sunday-school/follow-up-assignments?classId=${otherClassId}`))).json()
    expect(transferred.classes[0].children[0].assignee).toBeNull()
    await db.sundaySchoolChild.update({ where: { id: childId }, data: { classId } })
    await db.user.update({ where: { id: servantId }, data: { isDisabled: true } })
    expect((await (await read()).json()).classes[0].children[0].assignee).toBeNull()
  })

  it('denies priest writes and unassigned prep access from current database state', async () => {
    auth.user = { id: priestId, role: 'SUPER_ADMIN', name: 'Stale JWT' }
    expect((await PUT(req({ childId, assignmentId }))).status).toBe(403)
    auth.user = { id: outsiderId, role: 'SUPER_ADMIN', name: 'Stale JWT' }
    expect((await read()).status).toBe(403)
    expect((await PUT(req({ childId, assignmentId }))).status).toBe(403)
  })
})
