import { createHmac, timingSafeEqual } from 'node:crypto'

interface CalendarToken {
  userId: string
  classId: string
  authVersion: number
  expiresAt: number
}

function signature(payload: string): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for calendar subscriptions')
  return createHmac('sha256', secret).update(`sunday-school-birthday-calendar:v1:${payload}`).digest('base64url')
}

/** One personal, read-only class feed. Current account and class access are checked on every fetch. */
export function createBirthdayCalendarToken(payload: CalendarToken): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyBirthdayCalendarToken(token: string, now = Date.now()): CalendarToken | null {
  if (token.length > 2048) return null
  const [encoded, signed, extra] = token.split('.')
  if (!encoded || !signed || extra !== undefined) return null
  const expected = Buffer.from(signature(encoded))
  const actual = Buffer.from(signed)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object' || !('userId' in payload) || !('classId' in payload) ||
      !('authVersion' in payload) || !('expiresAt' in payload) ||
      typeof payload.userId !== 'string' || !/^[\w-]{1,128}$/.test(payload.userId) ||
      typeof payload.classId !== 'string' || !/^[\w-]{1,128}$/.test(payload.classId) ||
      !Number.isSafeInteger(payload.authVersion) || Number(payload.authVersion) < 0 ||
      typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) return null
    return payload as CalendarToken
  } catch { return null }
}

import { escapeText, foldLine } from './sunday-school-lesson-calendar'
import { birthdayDateInYear } from './sunday-school-birthdays'

export function buildBirthdayCalendar(
  cls: { id: string; name: string; updatedAt: Date },
  children: Array<{ id: string; firstName: string; lastName: string; birthDate: Date | null; updatedAt: Date }>,
  start: Date, end: Date, origin: string,
): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//St. Mark Ministry//Birthdays//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(`${cls.name} birthdays`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
  for (const child of children) {
    if (!child.birthDate) continue
    for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year++) {
      const date = birthdayDateInYear(child.birthDate, year)
      if (!date || date < start || date > end) continue
      const next = new Date(date)
      next.setUTCDate(next.getUTCDate() + 1)
      const stamp = new Date(Math.max(cls.updatedAt.getTime(), child.updatedAt.getTime())).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
      const day = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, '')
      const url = new URL('/dashboard/servants/birthdays', origin)
      url.searchParams.set('classId', cls.id)
      url.searchParams.set('child', child.id)
      lines.push('BEGIN:VEVENT', `UID:birthday-${child.id}-${year}@stmarkministry.app`,
        `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`, `DTSTART;VALUE=DATE:${day(date)}`,
        `DTEND;VALUE=DATE:${day(next)}`, `SUMMARY:${escapeText(`Happy birthday, ${child.firstName} ${child.lastName}!`)}`,
        `URL:${url.href}`, 'TRANSP:TRANSPARENT', 'END:VEVENT')
    }
  }
  return [...lines, 'END:VCALENDAR'].map(foldLine).join('\r\n') + '\r\n'
}
