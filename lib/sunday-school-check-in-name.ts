/** Match a typed full name without guessing how its first/last parts are split. */
export function normalizeCheckInName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}
export function matchCheckInName(children: Array<{ id: string; firstName: string; lastName: string }>, name: string): string | null {
  const normalized = normalizeCheckInName(name)
  const matches = children.filter(child => normalizeCheckInName(`${child.firstName} ${child.lastName}`) === normalized)
  return matches.length === 1 ? matches[0].id : null
}
