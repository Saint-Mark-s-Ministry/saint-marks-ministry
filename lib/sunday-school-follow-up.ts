import { getBirthdayParts } from './sunday-school-birthdays'
import { getChildFullName } from './sunday-school-class'

/** A child is on the follow-up list after this many meetings marked absent in a row (matches the absence notice). */
export const FOLLOW_UP_ABSENT_WEEKS = 3
/** Birthdays coming up within this many days, today included. */
export const FOLLOW_UP_BIRTHDAY_DAYS = 7

export type FollowUpReason = 'absent' | 'priority' | 'birthday'

interface FollowUpChild {
  id: string
  firstName: string
  lastName: string
  visitationPriority: boolean
  absentStreak?: { weeks: number; since: string | null }
  visitations: Array<{ status: string; visitedAt: string | null; createdAt: string }>
  phoneCalls: Array<{ calledAt: string; outcome: string }>
}

interface FollowUpClass {
  id: string
  name: string
  canEdit: boolean
  children: FollowUpChild[]
}

interface FollowUpBirthday {
  id: string
  firstName: string
  lastName: string
  classId: string | null
  birthDate: string
}

export interface FollowUpItem {
  childId: string
  name: string
  classId: string
  className: string
  canEdit: boolean
  reasons: FollowUpReason[]
  absentWeeks: number
  absentSince: string | null
  /** Days until the birthday (0 = today), when one is coming up. */
  birthdayInDays: number | null
  birthDate: string | null
  /** The newest call or visit, if any was logged since the absences began. */
  lastContact: { kind: 'call' | 'visit'; date: string; outcome?: string } | null
}

const DAY = 24 * 60 * 60 * 1000

/** Days from `today` (YYYY-MM-DD) to the next birthday on or after it. */
export function daysUntilBirthday(birthDate: string, today: string): number | null {
  const parts = getBirthdayParts(birthDate)
  if (!parts) return null
  const [y, m, d] = today.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d)
  for (const year of [y, y + 1]) {
    // Feb 29 birthdays fall on Feb 28 in other years.
    const lastDay = new Date(Date.UTC(year, parts.month, 0)).getUTCDate()
    const next = Date.UTC(year, parts.month - 1, Math.min(parts.day, lastDay))
    if (next >= start) return Math.round((next - start) / DAY)
  }
  return null
}

/**
 * Who needs a servant's attention this week: absent several meetings in a
 * row, starred for a priority visit, or a birthday coming up. One row per
 * child, carrying every reason, most urgent first.
 */
export function buildFollowUps(
  classes: FollowUpClass[],
  birthdays: FollowUpBirthday[],
  today: string,
): FollowUpItem[] {
  const items = new Map<string, FollowUpItem>()
  const classById = new Map(classes.map(cls => [cls.id, cls]))
  const row = (child: { id: string; firstName: string; lastName: string }, cls: FollowUpClass): FollowUpItem => ({
    childId: child.id,
    name: getChildFullName(child),
    classId: cls.id,
    className: cls.name,
    canEdit: cls.canEdit,
    reasons: [],
    absentWeeks: 0,
    absentSince: null,
    birthdayInDays: null,
    birthDate: null,
    lastContact: null,
  })

  for (const cls of classes) for (const child of cls.children) {
    const weeks = child.absentStreak?.weeks ?? 0
    const reasons: FollowUpReason[] = []
    if (weeks >= FOLLOW_UP_ABSENT_WEEKS) reasons.push('absent')
    if (child.visitationPriority) reasons.push('priority')
    if (reasons.length === 0) continue
    const since = child.absentStreak?.since ?? null
    const call = child.phoneCalls[0]
    const visit = child.visitations.find(v => v.status === 'DONE')
    const visitDate = visit ? (visit.visitedAt ?? visit.createdAt).slice(0, 10) : null
    const callDate = call ? call.calledAt.slice(0, 10) : null
    const newest = callDate && (!visitDate || callDate >= visitDate)
      ? { kind: 'call' as const, date: callDate, outcome: call.outcome }
      : visitDate ? { kind: 'visit' as const, date: visitDate } : null
    items.set(child.id, {
      ...row(child, cls),
      reasons,
      absentWeeks: weeks,
      absentSince: since,
      lastContact: newest && (!since || reasons.includes('priority') || newest.date >= since) ? newest : null,
    })
  }

  for (const child of birthdays) {
    const cls = child.classId ? classById.get(child.classId) : undefined
    if (!cls) continue
    const days = daysUntilBirthday(child.birthDate, today)
    if (days === null || days >= FOLLOW_UP_BIRTHDAY_DAYS) continue
    const item = items.get(child.id) ?? row(child, cls)
    item.reasons.push('birthday')
    item.birthdayInDays = days
    item.birthDate = child.birthDate
    items.set(child.id, item)
  }

  const rank = (item: FollowUpItem) =>
    item.reasons.includes('absent') ? (item.lastContact ? 1 : 0) : item.reasons.includes('priority') ? 2 : 3
  return [...items.values()].sort((a, b) =>
    rank(a) - rank(b) ||
    b.absentWeeks - a.absentWeeks ||
    (a.birthdayInDays ?? 99) - (b.birthdayInDays ?? 99) ||
    a.name.localeCompare(b.name)
  )
}
