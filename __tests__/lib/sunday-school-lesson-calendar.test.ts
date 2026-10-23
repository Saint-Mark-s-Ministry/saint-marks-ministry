import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLessonCalendarToken, verifyLessonCalendarToken, buildLessonCalendar } from '@/lib/sunday-school-lesson-calendar'
import { createPasswordToken } from '@/lib/password-reset'

const payload = { userId: 'servant-1', classId: 'class-1', authVersion: 2, expiresAt: Date.UTC(2028, 0, 1) }
const cls = { id: 'class-1', name: '10th Grade', classroom: '213', updatedAt: new Date('2026-10-01T12:00:00Z') }
const lesson = { id: 'lesson-1', title: 'Faith, hope; love', sundayDate: new Date('2026-10-25T00:00:00Z'), updatedAt: new Date('2026-10-23T12:30:00Z') }

beforeEach(() => { vi.stubEnv('NEXTAUTH_SECRET', 'calendar-unit-test-secret') })
afterEach(() => { vi.unstubAllEnvs() })

describe('personal lesson calendar tokens', () => {
  it('round-trips the precise owner and class scope', () => {
    expect(verifyLessonCalendarToken(createLessonCalendarToken(payload), Date.UTC(2027, 0, 1))).toEqual(payload)
  })
  it('rejects class/user tampering, malformed tokens, and expiration', () => {
    const token = createLessonCalendarToken(payload)
    const [, signature] = token.split('.')
    for (const changes of [{ classId: 'class-2' }, { userId: 'admin-1' }]) {
      const edited = Buffer.from(JSON.stringify({ ...payload, ...changes })).toString('base64url')
      expect(verifyLessonCalendarToken(`${edited}.${signature}`)).toBeNull()
    }
    for (const invalid of ['', 'abc', `${token}.extra`, 'x'.repeat(2049)]) expect(verifyLessonCalendarToken(invalid)).toBeNull()
    expect(verifyLessonCalendarToken(token, payload.expiresAt)).toBeNull()
  })
  it('cannot reuse password-reset signatures as calendar credentials', () => {
    expect(verifyLessonCalendarToken(createPasswordToken({ id: payload.userId, authVersion: 2 }, 'reset'))).toBeNull()
  })
  it('invalidates subscriptions when the signing secret changes', () => {
    const token = createLessonCalendarToken(payload)
    vi.stubEnv('NEXTAUTH_SECRET', 'rotated-calendar-secret')
    expect(verifyLessonCalendarToken(token)).toBeNull()
  })
})

describe('iCalendar lesson events', () => {
  it('uses all-day UTC calendar dates and an exclusive next-day end', () => {
    const feed = buildLessonCalendar(cls, [lesson], 'https://stmarkministry.app')
    expect(feed).toContain('DTSTART;VALUE=DATE:20261025\r\nDTEND;VALUE=DATE:20261026')
    expect(feed).toContain('UID:lesson-lesson-1@stmarkministry.app')
    expect(feed).toContain('SUMMARY:10th Grade: Faith\\, hope\\; love')
    expect(feed).toContain('LOCATION:Room 213')
    expect(feed).toContain('LAST-MODIFIED:20261023T123000Z')
    expect(feed.replace(/\r\n /g, '')).toContain('https://stmarkministry.app/dashboard/servants/lessons?view=list&classId=class-1&lesson=lesson-1')
    expect(feed).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(feed).toMatch(/END:VCALENDAR\r\n$/)
  })
  it('keeps event identity stable while propagating updated titles', () => {
    const original = buildLessonCalendar(cls, [lesson], 'https://stmarkministry.app')
    const updated = buildLessonCalendar(cls, [{ ...lesson, title: 'Changed lesson', updatedAt: new Date('2026-10-24T10:00:00Z') }], 'https://stmarkministry.app')
    expect(updated.match(/UID:.*/)?.[0]).toEqual(original.match(/UID:.*/)?.[0])
    expect(updated).toContain('SUMMARY:10th Grade: Changed lesson')
    expect(updated).toContain('LAST-MODIFIED:20261024T100000Z')
  })
  it('escapes injected properties and folds Unicode without corrupting text', () => {
    const title = 'تعليم'.repeat(35) + '\r\nEND:VEVENT\r\nBEGIN:VEVENT'
    const feed = buildLessonCalendar(cls, [{ ...lesson, title }], 'https://stmarkministry.app')
    expect(feed.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1)
    for (const line of feed.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
    expect(feed).not.toContain('\uFFFD')
    expect(feed.replace(/\r\n /g, '')).toContain('\\nEND:VEVENT\\nBEGIN:VEVENT')
  })
  it('handles the end of the year and unnamed lessons without inventing a meeting time', () => {
    const feed = buildLessonCalendar({ ...cls, classroom: null }, [{ ...lesson, title: null, sundayDate: new Date('2026-12-31T00:00:00Z') }], 'https://stmarkministry.app')
    expect(feed).toContain('DTEND;VALUE=DATE:20270101')
    expect(feed).toContain('Lesson to be announced')
    expect(feed).not.toContain('LOCATION:')
    expect(feed).not.toContain('DTSTART;TZID=')
  })
})
