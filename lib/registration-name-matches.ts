import { prisma } from './prisma'

export interface RegistrationNameMatch {
  id: string
  name: string
  email: string
  isDisabled: boolean
}

/** Compare complete names exactly; exclude the applicant's already-linked account. */
export async function withRegistrationNameMatches<T extends {
  fullName: string
  createdUserId: string | null
}>(submissions: T[]): Promise<Array<T & { exactNameMatches: RegistrationNameMatch[] }>> {
  const names = [...new Set(submissions.map(submission => submission.fullName).filter(Boolean))]
  const users = names.length === 0 ? [] : await prisma.user.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true, email: true, isDisabled: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }, { id: 'asc' }],
  })
  const byName = new Map<string, RegistrationNameMatch[]>()
  for (const user of users) {
    const matches = byName.get(user.name) ?? []
    matches.push(user)
    byName.set(user.name, matches)
  }
  return submissions.map(submission => ({
    ...submission,
    exactNameMatches: (byName.get(submission.fullName) ?? [])
      .filter(user => user.id !== submission.createdUserId),
  }))
}
