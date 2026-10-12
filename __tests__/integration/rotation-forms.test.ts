import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, SundaySchoolLevel } from '@prisma/client'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { approveAndAdvanceRotation } from '@/lib/rotation-form-service'
import { ROTATION_LEVELS, nextRotationStart, rotationWeekDate, completedRotationLevels } from '@/lib/rotation-forms'

const enabled = process.env.ROTATION_FORMS_INTEGRATION === '1'
const db = new PrismaClient()
const rollback = new Error('rollback rotation fixture')

describe.skipIf(!enabled)('signed rotation database workflow', () => {
  afterAll(() => db.$disconnect())
  afterEach(() => vi.useRealTimers())

  async function fixture(work: (tx: Prisma.TransactionClient, fixture: { studentId: string; reviewerId: string; currentId: string; yearId: string; sundayYearId: string; formId: string }) => Promise<void>) {
    if (!process.env.ROTATION_FORMS_TEST_DATABASE_URL || process.env.SP_DATABASE_URL !== process.env.ROTATION_FORMS_TEST_DATABASE_URL) throw new Error('Use the same isolated database for SP_DATABASE_URL and ROTATION_FORMS_TEST_DATABASE_URL')
    await expect(db.$transaction(async tx => {
      const id = randomUUID()
      await tx.academicYear.updateMany({ data: { isActive: false } })
      const year = await tx.academicYear.create({ data: { name: `rotation-${id}`, startDate: new Date('2020-01-01'), endDate: new Date('2030-12-31'), isActive: true } })
      const sundayYear = await tx.sundaySchoolYear.findFirst({ where: { status: 'OPEN' } }) ?? await tx.sundaySchoolYear.create({ data: { name: `rotation-${id}`, startDate: new Date('2026-09-11'), endDate: new Date('2027-09-10'), status: 'OPEN' } })
      const student = await tx.user.create({ data: { name: 'Rotation test student', email: `${id}@example.invalid`, password: 'not-a-valid-hash', role: 'STUDENT' } })
      const reviewer = await tx.user.create({ data: { name: 'Rotation test reviewer', email: `review-${id}@example.invalid`, password: 'not-a-valid-hash', role: 'SERVANT_PREP' } })
      await tx.studentEnrollment.create({ data: { studentId: student.id, isActive: true, isAsyncStudent: true, yearLevel: null } })
      const cls = await tx.sundaySchoolClass.create({ data: { name: 'Second grade', level: 'GRADE_2', academicYearId: year.id, sundaySchoolYearId: sundayYear.id } })
      const current = await tx.sundaySchoolAssignment.create({ data: { studentId: student.id, academicYearId: year.id, classId: cls.id, grade: 'GRADE_2', startDate: new Date('2026-09-13'), yearLevel: null } })
      const form = await tx.sundaySchoolRotationForm.create({ data: { assignmentId: current.id, level: 'GRADE_2', fileUrl: 'https://example.invalid/signed.pdf', filename: 'signed.pdf' } })
      expect(current.totalWeeks).toBe(4)
      await work(tx, { studentId: student.id, reviewerId: reviewer.id, currentId: current.id, yearId: year.id, sundayYearId: sundayYear.id, formId: form.id })
      throw rollback
    }, { timeout: 30000 })).rejects.toThrow(rollback)
  }

  it('credits four weeks and prefers an empty next-grade class while preserving history', async () => {
    await fixture(async (tx, f) => {
      const occupied = await tx.sundaySchoolClass.create({ data: { name: 'Third grade - 1', sectionName: '1', level: 'GRADE_3', academicYearId: f.yearId, sundaySchoolYearId: f.sundayYearId } })
      const empty = await tx.sundaySchoolClass.create({ data: { name: 'Third grade - 2', sectionName: '2', level: 'GRADE_3', academicYearId: f.yearId, sundaySchoolYearId: f.sundayYearId } })
      const other = await tx.user.create({ data: { name: 'Other rotating student', email: `${randomUUID()}@example.invalid`, password: 'not-a-valid-hash', role: 'STUDENT' } })
      await tx.studentEnrollment.create({ data: { studentId: other.id, isAsyncStudent: true, yearLevel: null } })
      await tx.sundaySchoolAssignment.create({ data: { studentId: other.id, academicYearId: f.yearId, classId: occupied.id, grade: 'GRADE_3', startDate: new Date('2026-09-13') } })
      const next = await approveAndAdvanceRotation(tx, { formId: f.formId, reviewerId: f.reviewerId, expectedVersion: 1, nextStartDate: nextRotationStart('2026-09-13'), reviewNotes: null })
      expect(next?.classId).toBe(empty.id)
      expect(next?.totalWeeks).toBe(4)
      expect(await tx.sundaySchoolAssignment.count({ where: { studentId: f.studentId, isActive: true } })).toBe(1)
      expect(await tx.sundaySchoolAssignment.count({ where: { studentId: f.studentId } })).toBe(2)
      expect((await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: f.currentId } })).isActive).toBe(false)
      const logs = await tx.sundaySchoolLog.findMany({ where: { assignmentId: f.currentId }, orderBy: { weekNumber: 'asc' } })
      expect(logs.map(log => log.weekNumber)).toEqual([1, 2, 3, 4])
      expect(logs.every(log => log.status === 'MANUAL' && log.rotationFormId === f.formId)).toBe(true)
      await expect(approveAndAdvanceRotation(tx, { formId: f.formId, reviewerId: f.reviewerId, expectedVersion: 1, nextStartDate: nextRotationStart('2026-09-13'), reviewNotes: null })).rejects.toThrow('already been reviewed')
    })
  })

  it('does not advance a three-week student without approval, and enforces one active rotation in the database', async () => {
    await fixture(async (tx, f) => {
      await tx.sundaySchoolLog.createMany({ data: [1, 2, 3].map(weekNumber => ({ assignmentId: f.currentId, weekNumber, weekOf: rotationWeekDate('2026-09-13', weekNumber), status: 'MANUAL' as const })) })
      expect((await tx.sundaySchoolRotationForm.findUniqueOrThrow({ where: { id: f.formId } })).status).toBe('PENDING')
      expect(await tx.sundaySchoolAssignment.count({ where: { studentId: f.studentId } })).toBe(1)
      await tx.$executeRawUnsafe('SAVEPOINT duplicate_rotation')
      await expect(tx.sundaySchoolAssignment.create({ data: { studentId: f.studentId, academicYearId: f.yearId, grade: 'GRADE_3', startDate: new Date('2026-10-11') } })).rejects.toThrow()
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT duplicate_rotation')
      expect((await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: f.currentId } })).isActive).toBe(true)
    })
  })

  it('rejects a stale review after a student replaces the form', async () => {
    await fixture(async (tx, f) => {
      await tx.sundaySchoolRotationForm.update({ where: { id: f.formId }, data: { version: { increment: 1 }, fileUrl: 'https://example.invalid/replaced.pdf' } })
      await expect(approveAndAdvanceRotation(tx, { formId: f.formId, reviewerId: f.reviewerId, expectedVersion: 1, nextStartDate: nextRotationStart('2026-09-13'), reviewNotes: null })).rejects.toThrow('form changed')
      expect(await tx.sundaySchoolLog.count({ where: { assignmentId: f.currentId } })).toBe(0)
      expect((await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: f.currentId } })).isActive).toBe(true)
    })
  })

  it('keeps the pending form and current rotation when the next grade has no active class', async () => {
    await fixture(async (tx, f) => {
      await expect(approveAndAdvanceRotation(tx, { formId: f.formId, reviewerId: f.reviewerId, expectedVersion: 1, nextStartDate: nextRotationStart('2026-09-13'), reviewNotes: null })).rejects.toThrow('active class for the next grade')
      expect((await tx.sundaySchoolRotationForm.findUniqueOrThrow({ where: { id: f.formId } })).status).toBe('PENDING')
      expect((await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: f.currentId } })).isActive).toBe(true)
    })
  })

  it('starts at second grade, wraps after eighth, and finishes after all ten grades are approved', async () => {
    await fixture(async (tx, f) => {
      for (const level of ROTATION_LEVELS.filter(level => level !== SundaySchoolLevel.GRADE_2)) await tx.sundaySchoolClass.create({ data: { name: level, level, academicYearId: f.yearId, sundaySchoolYearId: f.sundayYearId } })
      let current = await tx.sundaySchoolAssignment.findUniqueOrThrow({ where: { id: f.currentId } })
      const visited: SundaySchoolLevel[] = []
      vi.useFakeTimers()
      for (let step = 0; step < 10; step++) {
        vi.setSystemTime(rotationWeekDate(current.startDate, 4))
        const cls = await tx.sundaySchoolClass.findUniqueOrThrow({ where: { id: current.classId! } })
        const form = step === 0 ? await tx.sundaySchoolRotationForm.findUniqueOrThrow({ where: { id: f.formId } }) : await tx.sundaySchoolRotationForm.create({ data: { assignmentId: current.id, level: cls.level, fileUrl: 'https://example.invalid/signed.pdf', filename: 'signed.pdf' } })
        visited.push(cls.level)
        const next = await approveAndAdvanceRotation(tx, { formId: form.id, reviewerId: f.reviewerId, expectedVersion: form.version, nextStartDate: nextRotationStart(current.startDate), reviewNotes: null })
        if (step < 9) { expect(next).not.toBeNull(); current = next! } else expect(next).toBeNull()
      }
      expect(visited).toEqual(['GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5', 'GRADE_6', 'GRADE_7', 'GRADE_8', 'PRE_K', 'KINDERGARTEN', 'GRADE_1'])
      expect(await tx.sundaySchoolAssignment.count({ where: { studentId: f.studentId, isActive: true } })).toBe(0)
      const history = await tx.sundaySchoolAssignment.findMany({ where: { studentId: f.studentId }, include: { class: { select: { level: true } }, rotationForm: true } })
      expect(history).toHaveLength(10)
      expect(completedRotationLevels(history).size).toBe(10)
    })
  }, 30000)
})
