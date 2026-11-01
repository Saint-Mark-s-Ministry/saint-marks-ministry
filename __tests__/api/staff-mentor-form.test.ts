import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleTag } from '@prisma/client'
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), session: vi.fn(), context: vi.fn(), application: vi.fn(), enrollment: vi.fn(), requirement: vi.fn(),
  transaction: vi.fn(), appGuard: vi.fn(), enrollmentGuard: vi.fn(), annualGuard: vi.fn(), updateApp: vi.fn(), updateEnrollment: vi.fn(),
  annualCreate: vi.fn(), annualRead: vi.fn(), queue: vi.fn(), clear: vi.fn(), audit: vi.fn(), head: vi.fn(), token: vi.fn(), put: vi.fn(),
}))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/authorization', () => ({ getAuthorizationContext: mocks.context, canWriteBusinessData: (c: { disabled: boolean; readOnly: boolean }) => !c.disabled && !c.readOnly }))
vi.mock('@/lib/annual-mentor-information', () => ({ getAnnualMentorRequirement: mocks.requirement, queueAnnualMentorReview: mocks.queue }))
vi.mock('@vercel/blob', () => ({ head: mocks.head, put: mocks.put }))
vi.mock('@vercel/blob/client', () => ({ generateClientTokenFromReadWriteToken: mocks.token }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  registrationSubmission: { findFirst: mocks.application }, studentEnrollment: { findUnique: mocks.enrollment }, $transaction: mocks.transaction,
} }))
import { GET, PATCH } from '@/app/api/students/[id]/mentor-information/route'
import { POST } from '@/app/api/students/[id]/mentor-information/upload/route'

const date = () => new Date('2026-10-31T10:00:00Z')
const oldContact = { mentorName: 'Old Mentor', mentorPhone: '555-0100', mentorEmail: 'old@example.com' }
const newContact = { mentorName: 'New Mentor', mentorPhone: '555-0200', mentorEmail: 'new@example.com' }
function enrollment() { return { id: 'enrollment', updatedAt: date(), status: 'WITHDRAWN', isActive: false, mentorName: oldContact.mentorName, mentorPhone: oldContact.mentorPhone, approvalFormUrl: 'https://store.example/old.pdf', approvalFormFilename: 'old.pdf', student: { name: 'Student One' } } }
function information() { return { id: 'annual', updatedAt: date(), reviewedAt: date() as Date | null, reviewedBy: 'reviewer' as string | null, ...oldContact } }
interface Application { id: string; updatedAt: Date; mentorName: string; mentorPhone: string; mentorEmail: string; fatherOfConfessionName: string; approvalFormUrl: string; approvalFormFilename: string }
let model: { enrollment: ReturnType<typeof enrollment>; information: ReturnType<typeof information> | null; application: Application | null; annualRequired: boolean }
const params = { params: Promise.resolve({ id: 'student-1' }) }
const pathname = 'mentor-approval-forms/student-1/12345678-1234-1234-1234-123456789abc/form.pdf'
const request = (data: object) => new Request('https://app.example/api/students/student-1/mentor-information', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
async function currentForm() { return (await GET(request({}), params)).json() }

beforeEach(() => {
  vi.resetAllMocks()
  model = { enrollment: enrollment(), information: information(), application: null, annualRequired: true }
  mocks.auth.mockResolvedValue({ id: 'staff-1', role: 'SERVANT_PREP' })
  mocks.session.mockResolvedValue({})
  mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]) })
  mocks.application.mockImplementation(async () => model.application)
  mocks.enrollment.mockImplementation(async () => model.enrollment)
  mocks.requirement.mockImplementation(async () => model.annualRequired ? { activeYear: { id: 'year', name: '2026-2027' }, enrollment: model.enrollment, information: model.information } : null)
  mocks.appGuard.mockImplementation(async ({ data }) => { if (model.application) Object.assign(model.application, data); return { count: 1 } })
  mocks.enrollmentGuard.mockImplementation(async ({ data }) => { Object.assign(model.enrollment, data); return { count: 1 } })
  mocks.updateApp.mockImplementation(async ({ data }) => { if (model.application) Object.assign(model.application, data); return model.application })
  mocks.updateEnrollment.mockImplementation(async ({ data }) => { Object.assign(model.enrollment, data); return model.enrollment })
  mocks.annualGuard.mockImplementation(async ({ data }) => { if (model.information) Object.assign(model.information, data); return { count: 1 } })
  mocks.annualRead.mockImplementation(async () => model.information)
  mocks.annualCreate.mockImplementation(async ({ data }) => { model.information = { ...information(), ...data, reviewedAt: null, reviewedBy: null }; return model.information })
  const tx = { registrationSubmission: { updateMany: mocks.appGuard, update: mocks.updateApp },
    studentEnrollment: { updateMany: mocks.enrollmentGuard, update: mocks.updateEnrollment },
    annualMentorInformation: { updateMany: mocks.annualGuard, create: mocks.annualCreate, findUniqueOrThrow: mocks.annualRead },
    auditEvent: { create: mocks.audit }, notification: { deleteMany: mocks.clear } }
  mocks.transaction.mockImplementation(async work => {
    const before = structuredClone(model)
    try { return await work(tx) } catch (error) { model = before; throw error }
  })
  mocks.token.mockResolvedValue('scoped-token')
  mocks.head.mockResolvedValue({ pathname, contentType: 'application/octet-stream', size: 100, downloadUrl: 'https://store.example/new.pdf?download=1' })
})

describe('staff mentor form authority and contact corrections', () => {
  it.each([RoleTag.SERVANTS_PREP_SERVANT, RoleTag.SUPER_ADMIN])('allows current %s staff to read the eligible form', async tag => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([tag]) })
    const response = await GET(request({}), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ...oldContact, academicYear: '2026-2027' })
  })
  it.each([[], [RoleTag.SERVANTS_PREP_STUDENT], [RoleTag.SUNDAY_SCHOOL_SERVANT], [RoleTag.PARENT], [RoleTag.PRIEST], [RoleTag.SUPER_ADMIN, RoleTag.PRIEST]])('denies unauthorized tags %j', async (...tags) => {
    mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set(tags.flat()) })
    expect((await GET(request({}), params)).status).toBe(403)
    expect((await PATCH(request(newContact), params)).status).toBe(403)
    expect((await POST(request({ action: 'prepare' }), params)).status).toBe(403)
    expect(mocks.enrollment).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
  })
  it.each(['disabled', 'readOnly', 'impersonating'])('blocks %s sessions', async condition => {
    if (condition === 'impersonating') mocks.session.mockResolvedValue({ impersonating: {} })
    else mocks.context.mockResolvedValue({ disabled: false, readOnly: false, roleTags: new Set([RoleTag.SERVANTS_PREP_SERVANT]), [condition]: true })
    expect((await PATCH(request(newContact), params)).status).toBe(403)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('submits changed contact data for verification without reactivating or assigning a mentor', async () => {
    const form = await currentForm()
    const response = await PATCH(request({ ...newContact, version: form.version, status: 'ACTIVE', isActive: true, mentorId: 'attacker', studentId: 'other-student' }), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ...newContact, pendingReview: true })
    expect(model.enrollment).toMatchObject({ status: 'WITHDRAWN', isActive: false })
    expect(model.information).toMatchObject({ ...newContact, reviewedAt: null, reviewedBy: null })
    expect(mocks.updateEnrollment).toHaveBeenCalledWith({ where: { id: 'enrollment' }, data: { mentorName: newContact.mentorName, mentorPhone: newContact.mentorPhone } })
    expect(mocks.queue).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ studentId: 'student-1', academicYearId: 'year' }))
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorUserId: 'staff-1', entityId: 'student-1' }) })
  })
  it('does not reset verification or audit an unchanged form', async () => {
    const form = await currentForm()
    expect((await PATCH(request({ ...oldContact, version: form.version }), params)).status).toBe(200)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(model.information?.reviewedAt).toEqual(date())
  })
  it('can submit a missing annual form for a withdrawn legacy student', async () => {
    model.information = null
    const form = await currentForm()
    expect((await PATCH(request({ ...newContact, version: form.version }), params)).status).toBe(200)
    expect(mocks.annualCreate).toHaveBeenCalledWith({ data: { studentId: 'student-1', academicYearId: 'year', ...newContact } })
    expect(model.enrollment.isActive).toBe(false)
  })
  it('rejects a form changed by a student since the editor loaded', async () => {
    const form = await currentForm()
    model.information!.updatedAt = new Date('2026-10-31T10:01:00Z')
    expect((await PATCH(request({ ...newContact, version: form.version }), params)).status).toBe(409)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it.each(['enrollment', 'annual'])('rolls back when the %s version changes during the transaction', async row => {
    const form = await currentForm()
    ;(row === 'enrollment' ? mocks.enrollmentGuard : mocks.annualGuard).mockResolvedValueOnce({ count: 0 })
    expect((await PATCH(request({ ...newContact, version: form.version }), params)).status).toBe(409)
    expect(model.enrollment.updatedAt).toEqual(date())
    expect(model.information?.reviewedAt).toEqual(date())
    expect(mocks.audit).not.toHaveBeenCalled()
  })
  it.each([{ ...newContact, mentorName: '' }, { ...newContact, mentorPhone: '' }, { ...newContact, mentorEmail: 'bad-email' }])('rejects invalid contact details %j', async contact => {
    const form = await currentForm()
    expect((await PATCH(request({ ...contact, version: form.version }), params)).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('updates an approved Year 1 application and clears only its completed application reminder', async () => {
    model.annualRequired = false
    model.application = { id: 'application', updatedAt: date(), ...oldContact, fatherOfConfessionName: 'Fr. Mark', approvalFormUrl: 'https://store.example/old.pdf', approvalFormFilename: 'old.pdf' }
    const form = await currentForm()
    expect((await PATCH(request({ ...newContact, version: form.version }), params)).status).toBe(200)
    expect(model.application).toMatchObject(newContact)
    expect(mocks.queue).not.toHaveBeenCalled()
    expect(mocks.clear).toHaveBeenCalledWith({ where: { userId: 'student-1', type: 'REGISTRATION_INCOMPLETE', isPersistent: true } })
  })
  it('does not edit records without an existing mentor form source', async () => {
    model.annualRequired = false
    expect((await GET(request({}), params)).status).toBe(404)
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
})

describe('staff signed approval form replacement', () => {
  it('issues a token for the student, rather than the staff account, without modifying data', async () => {
    const form = await currentForm()
    const response = await POST(request({ action: 'prepare', filename: 'form.HEIC', size: 8000000, version: form.version }), params)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ pathname: expect.stringMatching(/^mentor-approval-forms\/student-1\//), clientToken: 'scoped-token' })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('replaces a verified file and invalidates the annual review atomically', async () => {
    const form = await currentForm()
    const response = await POST(request({ action: 'complete', filename: 'form.pdf', pathname, version: form.version }), params)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result).toMatchObject({ url: 'https://store.example/new.pdf?download=1', complete: false, pendingReview: true })
    expect(result.version).not.toBe(form.version)
    expect(model.enrollment.approvalFormUrl).toBe('https://store.example/new.pdf?download=1')
    expect(model.enrollment.isActive).toBe(false)
    expect(model.information?.reviewedAt).toBeNull()
    expect(mocks.queue).toHaveBeenCalledOnce()
    expect(mocks.audit.mock.calls[0][0].data.metadata.change).toBe('file')
  })
  it('rejects a stale upload before accessing storage', async () => {
    const form = await currentForm()
    model.information!.updatedAt = new Date('2026-10-31T10:02:00Z')
    expect((await POST(request({ action: 'complete', filename: 'form.pdf', pathname, version: form.version }), params)).status).toBe(409)
    expect(mocks.head).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()
  })
  it('rejects another student’s upload without replacing the saved file', async () => {
    const form = await currentForm()
    expect((await POST(request({ action: 'complete', filename: 'form.pdf', pathname: pathname.replace('student-1', 'student-2'), version: form.version }), params)).status).toBe(400)
    expect(model.enrollment.approvalFormUrl).toBe('https://store.example/old.pdf')
    expect(mocks.head).not.toHaveBeenCalled()
  })
  it('preserves the previous file and review when stored metadata is invalid', async () => {
    const form = await currentForm()
    mocks.head.mockResolvedValue({ pathname, contentType: 'text/html', size: 100 })
    expect((await POST(request({ action: 'complete', filename: 'form.pdf', pathname, version: form.version }), params)).status).toBe(400)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(model.information?.reviewedAt).toEqual(date())
  })
})
