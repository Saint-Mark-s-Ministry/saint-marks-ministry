import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), enrollment: vi.fn(), current: vi.fn(), classes: vi.fn(), update: vi.fn(), remove: vi.fn(), create: vi.fn(), history: vi.fn(), year: vi.fn() }))
vi.mock('@/lib/auth-helpers', () => ({ requireAuth: mocks.auth }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  studentEnrollment: { findUnique: mocks.enrollment },
  sundaySchoolClass: { findFirst: mocks.classes },
  academicYear: { findFirst: mocks.year },
  sundaySchoolAssignment: { findFirst: mocks.current, findUnique: mocks.current, findUniqueOrThrow: mocks.current, findMany: mocks.history, updateMany: mocks.update, deleteMany: mocks.remove, create: mocks.create },
} }))
import { POST } from '@/app/api/sunday-school/assignments/route'
import { DELETE, PATCH } from '@/app/api/sunday-school/assignments/[id]/route'
import { POST as RETIRED_CODE } from '@/app/api/sunday-school/logs/route'
const params = { params: Promise.resolve({ id: 'rotation-1' }) }
const current = { id: 'rotation-1', classId: 'class-1', grade: 'GRADE_2', isActive: true, totalWeeks: 4, startDate: new Date('2026-09-06'), updatedAt: new Date('2026-09-06'), logs: [1, 2, 3].map(weekNumber => ({ weekNumber, status: 'MANUAL' })), rotationForm: null, _count: { logs: 3 } }
function request(body: Record<string, unknown>) { return new Request('http://localhost/api/sunday-school/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
const newRotation = { studentId: 'student-1', classId: 'class-2', academicYearId: 'year-1', startDate: '2026-10-04' }

describe('rotation advancement and evidence guards', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.auth.mockResolvedValue({ id: 'prep-servant', role: 'SERVANT_PREP' })
    mocks.classes.mockResolvedValue({ level: 'GRADE_3' })
    mocks.enrollment.mockResolvedValue({ isActive: true, isAsyncStudent: true })
    mocks.current.mockResolvedValue(current)
    mocks.history.mockResolvedValue([])
    mocks.year.mockResolvedValue({ id: 'year-1' })
    mocks.create.mockResolvedValue({ id: 'new-rotation' })
    mocks.update.mockResolvedValue({ count: 1 })
    mocks.remove.mockResolvedValue({ count: 1 })
  })

  it('does not let a servant assign the next class while the current rotation has only three weeks', async () => {
    expect((await POST(request(newRotation))).status).toBe(409)
    expect(mocks.create).not.toHaveBeenCalled()
    expect((await PATCH(request({ isActive: false }), params)).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not replace the class or delete a rotation with recorded weeks', async () => {
    expect((await PATCH(request({ classId: 'class-2' }), params)).status).toBe(409)
    expect((await DELETE(request({}), params)).status).toBe(409)
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('does not accept a six-week new rotation and defaults new assignments to four weeks', async () => {
    mocks.current.mockResolvedValue(null)
    expect((await POST(request({ ...newRotation, totalWeeks: 6 }))).status).toBe(400)
    expect((await POST(request(newRotation))).status).toBe(201)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalWeeks: 4 }) }))
  })

  it('does not delete a form uploaded between checking and deleting an empty rotation', async () => {
    mocks.current.mockResolvedValue({ ...current, logs: [], _count: { logs: 0 } })
    mocks.remove.mockResolvedValue({ count: 0 })
    expect((await DELETE(request({}), params)).status).toBe(409)
    expect(mocks.remove).toHaveBeenCalledWith({ where: { id: 'rotation-1', logs: { none: {} }, rotationForm: null } })
  })

  it('does not reopen completed rotations', async () => {
    mocks.current.mockResolvedValue({ ...current, isActive: false, rotationForm: { status: 'APPROVED' } })
    expect((await PATCH(request({ isActive: true }), params)).status).toBe(409)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('retires weekly code submissions', async () => {
    expect((await RETIRED_CODE()).status).toBe(410)
  })
})
