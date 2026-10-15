import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/roles'
import { getSundaySchoolAccess } from '@/lib/sunday-school-access'

/** Product feedback is shared across ministries; this grants no Sunday School class access. */
export async function getFeedbackAccess(user: { id: string }) {
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, isDisabled: true },
  })
  if (!account || account.isDisabled) throw new Error('Forbidden')

  const access = await getSundaySchoolAccess(account)
  return { ...access, canRead: access.canRead || isAdmin(account.role) }
}
