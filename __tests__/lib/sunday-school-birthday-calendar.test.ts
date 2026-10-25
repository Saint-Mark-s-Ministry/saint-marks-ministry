import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBirthdayCalendar, createBirthdayCalendarToken, verifyBirthdayCalendarToken } from '@/lib/sunday-school-birthday-calendar'
import { createLessonCalendarToken } from '@/lib/sunday-school-lesson-calendar'
import { birthdayDateInYear, birthdayGreeting } from '@/lib/sunday-school-birthdays'
import { smsHref } from '@/lib/contact-links'

afterEach(() => vi.unstubAllEnvs())
const updatedAt = new Date('2026-01-01Z')
const cls = { id: 'cls', name: 'Class', updatedAt }
const child = { id: 'mary', firstName: 'Mary', lastName: 'Mark', birthDate: new Date('2012-02-29Z'), updatedAt }
const calendar = (children = [child]) => buildBirthdayCalendar(cls, children, new Date('2026-09-01Z'), new Date('2028-03-31Z'), 'https://example.com')

describe('birthday subscriptions', () => {
  it('uses independent signed credentials, rejects expiry and tampering', () => {
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret')
    const payload = { userId: 'user', classId: 'class', authVersion: 2, expiresAt: 2000 }
    const token = createBirthdayCalendarToken(payload)
    expect(verifyBirthdayCalendarToken(token, 1000)).toEqual(payload)
    expect(verifyBirthdayCalendarToken(token, 2000)).toBeNull()
    expect(verifyBirthdayCalendarToken(token + 'x', 1000)).toBeNull()
    expect(verifyBirthdayCalendarToken(createLessonCalendarToken(payload), 1000)).toBeNull()
  })
  it('emits bounded all-day occurrences with leap-day observance and stable IDs', () => {
    const result = calendar()
    expect(result).toContain('DTSTART;VALUE=DATE:20270228')
    expect(result).toContain('DTEND;VALUE=DATE:20270301')
    expect(result).toContain('DTSTART;VALUE=DATE:20280229')
    expect(result).not.toContain('DTSTART;VALUE=DATE:20260228')
    expect(result).toContain('UID:birthday-mary-2027@stmarkministry.app')
    expect(result).toContain('child=mary')
    expect(result).not.toMatch(/2012|VALARM|cellPhone|guardian/)
    expect(calendar([{ ...child, firstName: 'Maria' }])).toContain('UID:birthday-mary-2027@stmarkministry.app')
    expect(calendar([])).not.toContain('BEGIN:VEVENT')
  })
  it('escapes text, folds UTF-8 lines and excludes unknown dates', () => {
    const result = calendar([{ ...child, firstName: 'مريم'.repeat(30) + ',;\nEND:VEVENT' }])
    expect(result).toContain('\\,\\;\\nEND:VEVENT')
    for (const line of result.split('\r\n')) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75)
    expect(birthdayDateInYear('invalid', 2027)).toBeNull()
  })
  it('corrects event dates while retaining identity', () => {
    expect(calendar([{ ...child, birthDate: new Date('2012-03-02Z') }])).toContain('DTSTART;VALUE=DATE:20270302')
  })
})

describe('birthday greetings', () => {
  it('fills the name and safely encodes editable messages for both phone platforms', () => {
    const body = birthdayGreeting('Mary & Mark')
    expect(body).toBe('Happy birthday, Mary & Mark! May God bless you and grant you a joyful year ahead! 🎉')
    expect(smsHref('+1 (555) 123-4567', 'ios', body)).toBe(`sms:+15551234567&body=${encodeURIComponent(body)}`)
    expect(smsHref('5551234567', 'android', body)).toBe(`sms:5551234567?body=${encodeURIComponent(body)}`)
    expect(smsHref('unknown', 'ios', body)).toBeNull()
  })
})
