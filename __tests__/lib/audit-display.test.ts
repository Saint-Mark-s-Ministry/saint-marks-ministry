import { describe, expect, it } from 'vitest'
import {
  auditActionSummary,
  auditMetadataEntries,
  auditReasonLabel,
} from '@/lib/audit-display'

describe('audit display helpers', () => {
  it('turns technical View as activity into a plain-language summary', () => {
    expect(auditActionSummary({
      action: 'ADMIN_VIEW_AS_STARTED',
      result: 'SUCCESS',
      reason: null,
      entityType: 'User',
      entityId: 'user-2',
      metadata: { readOnly: true },
      target: { name: 'Liza Hanna', email: 'liza@example.com' },
    })).toBe('Started viewing as Liza Hanna')
  })

  it('uses retained metadata to name a deleted user', () => {
    expect(auditActionSummary({
      action: 'user.delete',
      result: 'SUCCESS',
      reason: null,
      entityType: 'User',
      entityId: 'deleted-user',
      metadata: { targetName: 'Deleted Person', targetEmail: 'deleted@example.com' },
      target: null,
    })).toBe('Deleted user account for Deleted Person')
  })

  it('explains coded reasons and formats metadata labels and values', () => {
    expect(auditReasonLabel('INVALID_CREDENTIALS')).toBe(
      'The email or password was incorrect.'
    )
    expect(auditMetadataEntries({
      provider: 'credentials',
      readOnly: true,
      grantedTags: ['SUPER_ADMIN', 'SUNDAY_SCHOOL_SERVANT'],
    })).toEqual([
      { label: 'Sign-in method', value: 'Email and password' },
      { label: 'Read-only session', value: 'Yes' },
      { label: 'Roles added', value: 'Super Admin, Sunday School Servant' },
    ])
  })
  const session = { result: 'SUCCESS' as const, reason: null, entityType: 'SundaySchoolSession', entityId: 'meeting', target: null }
  it.each([
    ['sunday_school.attendance_qr.created', 'Created an attendance QR code for Grade 3'],
    ['sunday_school.attendance_qr.replaced', 'Replaced an attendance QR code for Grade 3'],
    ['sunday_school.attendance_qr.closed', 'Closed attendance QR check-in for Grade 3'],
    ['sunday_school.attendance.finished', 'Finished Sunday School attendance for Grade 3'],
    ['sunday_school.contact_update_qr.created', 'Created a contact-update QR code for Grade 3'],
    ['sunday_school.contact_update_qr.revoked', 'Revoked a contact-update QR code for Grade 3'],
  ])('explains %s with the class name', (action, expected) => {
    expect(auditActionSummary({ ...session, action, metadata: { targetName: 'Grade 3' } })).toBe(expected)
  })

  it.each([
    ['sunday_school.attendance_qr.approved', 1, 'Confirmed 1 Sunday School QR check-in request'],
    ['sunday_school.attendance_qr.dismissed', 2, 'Dismissed 2 Sunday School QR check-in requests'],
  ])('counts %s requests', (action, requestCount, expected) => {
    expect(auditActionSummary({ ...session, action, metadata: { requestCount } })).toBe(expected)
  })

  it('labels older QR attendance correctly instead of calling it servant attendance', () => {
    expect(auditActionSummary({ ...session, action: 'attendance.sunday_school_children.qr_check_in', metadata: { personCount: 2 } })).toBe('Marked 2 people present from Sunday School QR check-in')
  })

  it('names existing roster/contact links using retained class metadata', () => {
    expect(auditActionSummary({ ...session, entityType: 'SundaySchoolRosterLink', action: 'SUNDAY_SCHOOL_ROSTER_LINK_CREATED', metadata: { className: 'Grade 3', contactUpdateOnly: true } })).toBe('Created a contact-update QR code for Grade 3')
    expect(auditActionSummary({ ...session, entityType: 'SundaySchoolRosterLink', action: 'SUNDAY_SCHOOL_ROSTER_LINK_REVOKED', metadata: { targetName: 'Grade 3' } })).toBe('Revoked a roster sign-up link for Grade 3')
  })

  it('keeps the meeting calendar date intact in activity details', () => {
    expect(auditMetadataEntries({ attendanceDate: '2026-11-14', requestCount: 2, attendanceAddedCount: 1 })).toEqual([
      { label: 'Attendance date', value: '2026-11-14' },
      { label: 'Requests reviewed', value: '2' },
      { label: 'Attendance marks added', value: '1' },
    ])
  })

})
