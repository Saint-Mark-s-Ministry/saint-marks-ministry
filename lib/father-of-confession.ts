import type { Prisma } from '@prisma/client'

const MARKOS_CANONICAL_NAME = 'Very Rev. Fr. Markos Ayoub'

/** Explicitly confirmed aliases only; never infer identity from similar priest names. */
const CONFIRMED_MARKOS_ALIASES = new Set([
  'abouna markos',
  'abuna marcos',
  'father marcos',
  'fr markos ayoub',
  'rev fr markos ayoub',
  'very rev fr markos ayoub',
])

export function canonicalFatherOfConfessionName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ')
  const key = trimmed.replace(/\./g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return CONFIRMED_MARKOS_ALIASES.has(key) ? MARKOS_CANONICAL_NAME : trimmed
}

/** Shared by applications, registration approval, and servant-created records. */
export async function findOrCreateFatherOfConfession(
  db: Pick<Prisma.TransactionClient, 'fatherOfConfession'>,
  input: { name: string; phone?: string | null; church?: string | null },
) {
  const name = canonicalFatherOfConfessionName(input.name)
  const select = { id: true, name: true, phone: true, church: true, isActive: true } as const
  const existing = await db.fatherOfConfession.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, isActive: true },
    select,
  })
  if (existing) return { father: existing, created: false }
  const father = await db.fatherOfConfession.create({
    data: { name, phone: input.phone ?? null, church: input.church ?? null, isActive: true },
    select,
  })
  return { father, created: true }
}
