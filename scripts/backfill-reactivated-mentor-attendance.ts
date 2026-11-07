/** One-time repair for verified Year 2 mentor forms. Preview by default. */
import { Prisma, PrismaClient } from '@prisma/client'
import { repairMentorReactivationAttendance } from '../lib/mentor-reactivation-attendance-repair'

const db = new PrismaClient()
const apply = process.argv.includes('--apply')

async function main() {
  const expectedHost = process.argv.find(arg => arg.startsWith('--expected-host='))?.split('=')[1]
  const databaseUrl = process.env.SP_DATABASE_URL
  if (!databaseUrl) throw new Error('SP_DATABASE_URL is required')
  if (apply && (!expectedHost || new URL(databaseUrl).hostname !== expectedHost)) {
    throw new Error('Applying requires --expected-host=<database hostname> matching SP_DATABASE_URL')
  }

  const result = await db.$transaction(async tx => {
    return repairMentorReactivationAttendance(tx, apply)
  }, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  console.log(JSON.stringify(result))
}

main().catch((error: unknown) => {
  if (error instanceof Error && (error.message.startsWith('SP_DATABASE_URL') || error.message.startsWith('Applying requires'))) {
    console.error(error.message)
  } else {
    console.error('Attendance repair failed; no repair was committed. Check database configuration and retry.')
  }
  process.exitCode = 1
}).finally(() => db.$disconnect())
