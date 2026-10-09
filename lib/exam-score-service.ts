import { Prisma, RoleTag } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAuth } from '@/lib/auth-helpers'
import { getAuthorizationContext, assertCanWriteBusinessData } from '@/lib/authorization'

// Retake entry and original-grade corrections share this transaction boundary.
export async function examScoreTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code) && attempt < 2) continue
      throw error
    }
  }
}

export async function requireExamScoreWriter() {
  const user = await requireAuth()
  const context = await getAuthorizationContext(user.id)
  assertCanWriteBusinessData(context)
  if (!context.roleTags.has(RoleTag.SUPER_ADMIN) && !context.roleTags.has(RoleTag.SERVANTS_PREP_SERVANT)) throw new Error('Forbidden')
  return user
}
