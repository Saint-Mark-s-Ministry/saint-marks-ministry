/**
 * Audit: bun scripts/link-prep-roster-students.ts --expected-host <database-host>
 * Link verified matches: same command with --apply
 *
 * Uses SP_DATABASE_URL_UNPOOLED (or SP_DATABASE_URL). Supply the intended
 * environment explicitly; Bun otherwise loads the local development .env.local.
 * Output contains personal information: save it outside the repository.
 * Does not create/delete accounts, change role tags, or overwrite existing links.
 */
import { Prisma, PrismaClient } from '@prisma/client'
import { matchPrepStudentsToRoster } from '../lib/servants-prep-roster-matching'

async function main() {
  const args = process.argv.slice(2)
  const expectedHost = args[args.indexOf('--expected-host') + 1]
  const apply = args.includes('--apply')
  if (!args.includes('--expected-host') || !expectedHost || expectedHost.startsWith('--')) {
    throw new Error('Pass --expected-host with the intended database hostname')
  }
  const connection = process.env.SP_DATABASE_URL_UNPOOLED || process.env.SP_DATABASE_URL
  if (!connection || new URL(connection).hostname !== expectedHost) {
    throw new Error('Database host does not match --expected-host; no records changed')
  }

  const prisma = new PrismaClient({ datasourceUrl: connection })
  try {
    // Read and revalidate within the write transaction. Serializable isolation
    // and the unique child.userId constraint prevent competing link decisions.
    const result = await prisma.$transaction(async tx => {
      const [accounts, children] = await Promise.all([
        tx.user.findMany({
          where: {
            isDisabled: false,
            enrollments: { some: { isActive: true, status: 'ACTIVE' } },
          },
          select: {
            id: true,
            name: true,
            createdFromRegistration: {
              where: { status: 'APPROVED' },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
              select: { grade: true, dateOfBirth: true },
            },
          },
        }),
        tx.sundaySchoolChild.findMany({
          // Include every record so an archived or differently graded link
          // cannot be missed and accidentally replaced.
          select: {
            id: true, firstName: true, lastName: true, level: true,
            birthDate: true, userId: true, isActive: true, status: true,
          },
        }),
      ])
      const matches = matchPrepStudentsToRoster(accounts.map(account => {
        const registration = account.createdFromRegistration[0]
        return {
          id: account.id,
          name: account.name,
          registration: registration ? {
            grade: registration.grade,
            birthDate: registration.dateOfBirth.toISOString().slice(0, 10),
          } : null,
        }
      }), children.map(child => ({
        ...child,
        birthDate: child.birthDate?.toISOString().slice(0, 10) ?? null,
      })))

      let linkedCount = 0
      for (const match of matches) {
        if (match.status !== 'ready') continue
        const child = children.find(record => record.id === match.candidates[0].id)!
        if (!child.isActive || child.status !== 'ACTIVE') {
          match.status = 'review'
          match.reason = 'Roster record is archived or inactive'
          continue
        }
        if (apply) {
          const updated = await tx.sundaySchoolChild.updateMany({
            where: { id: child.id, userId: null, isActive: true, status: 'ACTIVE' },
            data: { userId: match.studentId },
          })
          if (updated.count !== 1) throw new Error('A roster link changed during matching; transaction rolled back')
          linkedCount++
        }
      }
      return { mode: apply ? 'apply' : 'audit', linkedCount, matches }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 })
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // Prisma connection errors can include connection details. Never print them.
  console.error(error instanceof Error && !error.name.startsWith('Prisma')
    ? error.message : 'Database operation failed; check access and rerun the audit. No partial transaction was committed.')
  process.exitCode = 1
})
