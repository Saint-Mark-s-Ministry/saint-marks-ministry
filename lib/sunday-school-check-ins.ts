/** Monday–Sunday in the church's timezone; stored calendar dates stay at UTC midnight. */
export function getCheckInWeek(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const today = new Date(`${values.year}-${values.month}-${values.day}T00:00:00.000Z`)
  const start = new Date(today)
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return { start, end, today }
}
