import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'

const enabled = process.env.ASYNC_YEAR_INTEGRATION === '1'
const db = new PrismaClient()
const rollback = new Error('rollback test fixture')

describe.skipIf(!enabled)('enrollment year database constraint', () => {
  afterAll(() => db.$disconnect())

  async function fixture(work: (studentId: string, tx: Prisma.TransactionClient) => Promise<void>) {
    if (!process.env.ASYNC_YEAR_TEST_DATABASE_URL || process.env.SP_DATABASE_URL !== process.env.ASYNC_YEAR_TEST_DATABASE_URL) {
      throw new Error('Point ASYNC_YEAR_TEST_DATABASE_URL and SP_DATABASE_URL at the same isolated test database.')
    }
    await expect(db.$transaction(async tx => {
      const student = await tx.user.create({ data: { name: 'Async year test', email: `${randomUUID()}@example.invalid`, password: 'not-a-valid-hash', role: 'STUDENT' } })
      await work(student.id, tx)
      throw rollback
    })).rejects.toThrow(rollback)
  }

  it('accepts both valid modes and atomic transitions', async () => {
    await fixture(async (studentId, tx) => {
      await tx.studentEnrollment.create({ data: { studentId, yearLevel: 'YEAR_1' } })
      const asyncEnrollment = await tx.studentEnrollment.update({ where: { studentId }, data: { isAsyncStudent: true, yearLevel: null } })
      expect(asyncEnrollment.yearLevel).toBeNull()
      const regular = await tx.studentEnrollment.update({ where: { studentId }, data: { isAsyncStudent: false, yearLevel: 'YEAR_2' } })
      expect(regular.yearLevel).toBe('YEAR_2')
    })
  })

  it.each([
    { isAsyncStudent: false, yearLevel: null },
    { isAsyncStudent: true, yearLevel: 'YEAR_1' as const },
    { isAsyncStudent: true, yearLevel: 'YEAR_2' as const },
  ])('rejects invalid state $isAsyncStudent / $yearLevel even outside the API', async data => {
    await fixture(async (studentId, tx) => {
      await tx.$executeRawUnsafe('SAVEPOINT invalid_state')
      await expect(tx.studentEnrollment.create({ data: { studentId, ...data } })).rejects.toThrow('StudentEnrollment_attendance_mode_year_check')
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT invalid_state')
    })
  })
})
