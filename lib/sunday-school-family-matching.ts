import type { Prisma } from '@prisma/client'
import { normalizeHomeAddress } from './address'
import { familyDetailOverrides, normalizeSundaySchoolFamilyDetails, type SundaySchoolFamilyDetails } from './sunday-school-family'
import type { FamilyMatchingEvent, FamilyMatchingHistory } from '@/types/sunday-school-family-matching'

/** Compare complete phone numbers, never suffixes. US/Canada is the local default. */
export function normalizeFamilyPhone(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const input = value.trim()
  // Reject multiple numbers and malformed values instead of joining their digits.
  if (!/^\+?[\d\s().-]+$/.test(input)) return null
  let digits = input.replace(/\D/g, '')
  const international = input.startsWith('+') || input.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (/^(\d)\1+$/.test(digits)) return null
  if (!international && digits.length < 10) return null
  if (digits.length === 10 && !international) digits = `1${digits}`
  if (digits.length < 8 || digits.length > 15 || /^0+$/.test(digits)) return null
  return digits
}

type Family = SundaySchoolFamilyDetails & {
  id: string
  createdAt: Date
  matchingHistory: Prisma.JsonValue | null
  matchingPhones?: string[]
}
type Child = { id: string; familyId: string | null; guardianPhone: string | null; parentPhones?: Array<string | null>; familyDetailsOverrides?: Prisma.JsonValue | null }

export function readFamilyMatchingHistory(value: unknown): FamilyMatchingHistory {
  if (!value || typeof value !== 'object' || !('events' in value) || !Array.isArray(value.events)) {
    return { events: [] }
  }
  return value as FamilyMatchingHistory
}

function comparable(field: keyof SundaySchoolFamilyDetails, value: string) {
  if (field.endsWith('Phone')) return normalizeFamilyPhone(value) ?? value.trim()
  if (field === 'homeAddress') return normalizeHomeAddress(value)?.toLowerCase()
  return value.trim().toLowerCase()
}

/** Pure connected-component planner: a shared parent connects siblings across classes. */
export function planFamilyMatches(families: Family[], children: Child[], childIds?: string[]) {
  const nodes = new Map<string, { families: Family[]; children: Child[]; phones: Set<string> }>()
  const keyFor = (child: Child) => child.familyId ? `family:${child.familyId}` : `child:${child.id}`
  for (const child of children) {
    const key = keyFor(child)
    const node = nodes.get(key) ?? { families: [], children: [], phones: new Set<string>() }
    node.children.push(child)
    for (const value of [child.guardianPhone, ...(child.parentPhones ?? [])]) {
      const phone = normalizeFamilyPhone(value)
      if (phone) node.phones.add(phone)
    }
    nodes.set(key, node)
  }
  for (const family of families) {
    const node = nodes.get(`family:${family.id}`)
    if (!node) continue // Retained source records with no children are not new matches.
    node.families.push(family)
    for (const value of [family.motherPhone, family.fatherPhone, ...(family.matchingPhones ?? [])]) {
      const phone = normalizeFamilyPhone(value)
      if (phone) node.phones.add(phone)
    }
  }
  const byPhone = new Map<string, string[]>()
  for (const [key, node] of nodes) for (const phone of node.phones) {
    byPhone.set(phone, [...(byPhone.get(phone) ?? []), key])
  }
  const visited = new Set<string>()
  const seeds = childIds ? new Set(childIds) : null
  const plans = []
  for (const key of nodes.keys()) {
    if (visited.has(key)) continue
    const queue = [key]
    const componentFamilies: Family[] = []
    const componentChildren: Child[] = []
    for (let index = 0; index < queue.length; index++) {
      const next = queue[index]
      if (visited.has(next)) continue
      visited.add(next)
      const node = nodes.get(next)!
      componentFamilies.push(...node.families)
      componentChildren.push(...node.children)
      for (const phone of node.phones) queue.push(...(byPhone.get(phone) ?? []))
    }
    if (seeds && !componentChildren.some(child => seeds.has(child.id))) continue
    // A lone legacy guardian does not need an otherwise empty family record.
    if (componentFamilies.length === 0 && componentChildren.length < 2) continue
    componentFamilies.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    const canonical = componentFamilies[0] ?? null
    const details = normalizeSundaySchoolFamilyDetails(canonical ?? {})!
    const filled: FamilyMatchingEvent['filled'] = []
    const conflicts: FamilyMatchingEvent['conflicts'] = []
    for (const field of Object.keys(details) as Array<keyof SundaySchoolFamilyDetails>) {
      const values = componentFamilies.filter(family => family[field]?.trim())
      const distinct = new Map(values.map(family => [comparable(field, family[field]!), family[field]!]))
      if (distinct.size > 1) conflicts.push({ field, values: [...distinct.values()] })
      // Do not guess when a missing field has conflicting possible sources.
      if (!details[field] && distinct.size === 1) {
        const source = values[0]
        details[field] = source[field]
        filled.push({ field, sourceFamilyId: source.id })
      }
    }
    const linkedChildren = componentChildren.filter(child => !canonical || child.familyId !== canonical.id)
    if (!linkedChildren.length && !filled.length) continue
    plans.push({ canonical, families: componentFamilies, children: componentChildren, linkedChildren, details, filled, conflicts })
  }
  return plans
}

// All roster contact writers take the same transaction lock BEFORE their writes.
// This also serializes two simultaneous sign-ups for a previously unknown family.
export async function lockFamilyMatching(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(710231001)`
}

/** CSV submissions enrich shared records; differences become review history. */
export async function fillImportedFamilyDetails(
  tx: Prisma.TransactionClient,
  familyId: string,
  input: Partial<SundaySchoolFamilyDetails>,
  actorUserId: string,
  origin?: { importId: string; rowNumber: number },
) {
  const current = await tx.sundaySchoolFamily.findUniqueOrThrow({ where: { id: familyId } })
  const filled: FamilyMatchingEvent['filled'] = []
  const conflicts: FamilyMatchingEvent['conflicts'] = []
  const data: Partial<SundaySchoolFamilyDetails> = {}
  for (const field of Object.keys(input) as Array<keyof SundaySchoolFamilyDetails>) {
    const value = input[field]
    if (!value) continue
    if (!current[field]?.trim()) {
      data[field] = value
      filled.push({ field, sourceFamilyId: familyId })
    } else if (comparable(field, current[field]!) !== comparable(field, value)) {
      conflicts.push({ field, values: [current[field]!, value] })
    }
  }
  if (!filled.length && !conflicts.length) return
  const history = readFamilyMatchingHistory(current.matchingHistory)
  const event: FamilyMatchingEvent = {
    at: new Date().toISOString(), actorUserId, childIds: [], previousFamilyIds: {},
    ...(origin ? { origin: { type: 'roster-import' as const, ...origin } } : {}),
    sources: [{ familyId, details: normalizeSundaySchoolFamilyDetails(input)! as unknown as Record<string, string | null> }],
    filled, conflicts,
  }
  await tx.sundaySchoolFamily.update({ where: { id: familyId }, data: {
    ...data, matchingHistory: { ...history, events: [...history.events, event] } as unknown as Prisma.InputJsonValue,
  } })
}

/** Run inside the caller's locked write transaction; never grant guardian/account access. */
export async function matchSundaySchoolFamilies(
  tx: Prisma.TransactionClient,
  options: { childIds?: string[]; actorUserId?: string | null } = {},
) {
  if (options.childIds?.length === 0) return { matchedFamilies: 0, linkedChildren: 0, filledFields: 0, conflicts: 0 }
  const families = await tx.sundaySchoolFamily.findMany({
    where: { children: { some: {} } },
    select: { id: true, createdAt: true, name: true, homeAddress: true, matchingPhones: true,
      motherName: true, motherPhone: true, motherEmail: true,
      fatherName: true, fatherPhone: true, fatherEmail: true },
  })
  const children = await tx.sundaySchoolChild.findMany({
    select: { id: true, familyId: true, guardianPhone: true, familyDetailsOverrides: true,
      guardians: { where: { endedAt: null }, select: {
        guardianProfile: { select: { phone: true } }, parent: { select: { phone: true } },
      } },
    },
  })
  const plans = planFamilyMatches(families.map(family => ({ ...family, matchingHistory: null })), children.map(child => ({
    ...child, parentPhones: child.guardians.map(link => link.guardianProfile?.phone || link.parent.phone),
  })), options.childIds)
  // History can grow over time. Fetch it only for records being consolidated.
  const historyRows = plans.length ? await tx.sundaySchoolFamily.findMany({
    where: { id: { in: plans.flatMap(plan => plan.families.map(family => family.id)) } },
    select: { id: true, matchingHistory: true },
  }) : []
  const histories = new Map(historyRows.map(family => [family.id, family.matchingHistory]))
  let linkedChildren = 0
  let filledFields = 0
  let conflicts = 0
  for (const plan of plans) {
    const event: FamilyMatchingEvent = {
      at: new Date().toISOString(), actorUserId: options.actorUserId ?? null,
      childIds: plan.linkedChildren.map(child => child.id),
      previousFamilyIds: Object.fromEntries(plan.linkedChildren.map(child => [child.id, child.familyId])),
      sources: plan.families.map(family => ({ familyId: family.id, details: normalizeSundaySchoolFamilyDetails(family)! as unknown as Record<string, string | null> })),
      filled: plan.filled, conflicts: plan.conflicts,
    }
    const history: FamilyMatchingHistory = {
      events: [...plan.families.flatMap(family => readFamilyMatchingHistory(histories.get(family.id)).events), event],
    }
    // A connected family can have more than two parents. Keep those identities
    // available for later siblings without replacing the displayed parent fields.
    const displayedPhones = new Set([plan.details.motherPhone, plan.details.fatherPhone].map(normalizeFamilyPhone))
    const matchingPhones = [...new Set(plan.families.flatMap(family => [
      family.motherPhone, family.fatherPhone, ...(family.matchingPhones ?? []),
    ]).map(normalizeFamilyPhone).filter((phone): phone is string => Boolean(phone) && !displayedPhones.has(phone)))]
    const data = { ...plan.details, matchingPhones, matchingHistory: history as unknown as Prisma.InputJsonValue }
    const family = plan.canonical
      ? await tx.sundaySchoolFamily.update({ where: { id: plan.canonical.id }, data })
      : await tx.sundaySchoolFamily.create({ data })
    await tx.sundaySchoolChild.updateMany({
      where: { id: { in: plan.linkedChildren.map(child => child.id) } },
      data: { familyId: family.id },
    })
    for (const child of plan.linkedChildren) {
      const source = plan.families.find(source => source.id === child.familyId)
      if (!source) continue
      const overrides = familyDetailOverrides(child.familyDetailsOverrides)
      let changed = false
      for (const field of Object.keys(plan.details) as Array<keyof SundaySchoolFamilyDetails>) {
        const original = source[field]
        const shared = plan.details[field]
        if (original?.trim() && (!shared || comparable(field, original) !== comparable(field, shared)) && !Object.hasOwn(overrides, field)) {
          overrides[field] = original
          changed = true
        }
      }
      if (changed) await tx.sundaySchoolChild.update({
        where: { id: child.id }, data: { familyDetailsOverrides: overrides },
      })
    }
    // Source families remain intact (but unlinked), as an additional recovery record.
    linkedChildren += plan.linkedChildren.length
    filledFields += plan.filled.length
    conflicts += plan.conflicts.length
  }
  return { matchedFamilies: plans.length, linkedChildren, filledFields, conflicts }
}
