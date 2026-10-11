// Calendar days use midnight UTC; the scheduling cutoff follows church time.
export function makeupToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function upcomingMakeupFridays(now = new Date()): string[] {
  const date = new Date(`${makeupToday(now)}T00:00:00Z`)
  // Start tomorrow so students cannot book a session that may already be over.
  date.setUTCDate(date.getUTCDate() + 1)
  while (date.getUTCDay() !== 5) date.setUTCDate(date.getUTCDate() + 1)
  return Array.from({ length: 12 }, () => {
    const value = date.toISOString().slice(0, 10)
    date.setUTCDate(date.getUTCDate() + 7)
    return value
  })
}

export function isMakeupFriday(value: unknown, now = new Date()): value is string {
  return typeof value === 'string' && upcomingMakeupFridays(now).includes(value)
}

export function makeupExamReason(percentage: number | null, passingScore: number): 'FAILED' | 'MISSED' | null {
  if (percentage === null) return 'MISSED'
  return percentage < passingScore ? 'FAILED' : null
}
