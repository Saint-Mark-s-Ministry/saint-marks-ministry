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
  return createHmac('sha256', secret).update(`sunday-school-lesson-calendar:v1:${payload}`).digest('base64url')
}

/** One personal, read-only class feed. Current account and class access are checked on every fetch. */
export function createLessonCalendarToken(payload: CalendarToken): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded)}`
}

export function verifyLessonCalendarToken(token: string, now = Date.now()): CalendarToken | null {
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

function escapeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}

/** RFC 5545: fold at 75 UTF-8 octets, without splitting a character. */
function foldLine(line: string): string {
  let result = ''
  let bytes = 0
  for (const character of line) {
    const size = Buffer.byteLength(character)
    if (bytes + size > 75) { result += '\r\n '; bytes = 1 }
    result += character
    bytes += size
  }
  return result
}

interface CalendarLesson {
  id: string
  sundayDate: Date
  title: string | null
  updatedAt: Date
}

export function buildLessonCalendar(
  cls: { id: string; name: string; classroom: string | null; updatedAt: Date },
  lessons: CalendarLesson[],
  origin: string,
): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//St. Mark Ministry//Class Lessons//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(`${cls.name} lessons`)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H']
  for (const lesson of lessons) {
    const end = new Date(lesson.sundayDate)
    end.setUTCDate(end.getUTCDate() + 1)
    const stamp = new Date(Math.max(cls.updatedAt.getTime(), lesson.updatedAt.getTime()))
      .toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const url = new URL('/dashboard/servants/lessons', origin)
    url.searchParams.set('view', 'list')
    url.searchParams.set('classId', cls.id)
    url.searchParams.set('lesson', lesson.id)
    lines.push('BEGIN:VEVENT', `UID:lesson-${lesson.id}@stmarkministry.app`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${stamp}`,
      `DTSTART;VALUE=DATE:${lesson.sundayDate.toISOString().slice(0, 10).replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`,
      `SUMMARY:${escapeText(`${cls.name}: ${lesson.title || 'Lesson to be announced'}`)}`,
      `DESCRIPTION:${escapeText('Open the lesson in St. Mark Ministry for the teacher and lesson resources.')}`,
      `URL:${url.href}`, 'TRANSP:TRANSPARENT')
    if (cls.classroom) lines.push(`LOCATION:${escapeText(`Room ${cls.classroom}`)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
