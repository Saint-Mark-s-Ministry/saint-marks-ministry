const SESSION_ACTION_LABELS: Record<string, string> = {
  'sunday_school.attendance_qr.created': 'Created an attendance QR code',
  'sunday_school.attendance_qr.replaced': 'Replaced an attendance QR code',
  'sunday_school.attendance_qr.closed': 'Closed attendance QR check-in',
  'sunday_school.attendance.finished': 'Finished Sunday School attendance',
  'sunday_school.contact_update_qr.created': 'Created a contact-update QR code',
  'sunday_school.contact_update_qr.revoked': 'Revoked a contact-update QR code',
}

const ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN: 'Signed in',
  AUTH_PASSWORD_CHANGE: 'Changed password',
  VIEW_AS_ACCESS_GRANTED: 'Granted View as access',
  VIEW_AS_ACCESS_REVOKED: 'Revoked View as access',
  ADMIN_VIEW_AS_STARTED: 'Started View as',
  ADMIN_VIEW_AS_SWITCHED: 'Switched View as user',
  ADMIN_VIEW_AS_STOPPED: 'Stopped View as',
  'user.role_tags.update': 'Updated access roles',
  'user.delete': 'Deleted a user account',
  'user.password_reset_email.send': 'Sent a password reset email',
  'sunday_school.priest_note.create': 'Created a confidential visitation note',
}

const REASON_LABELS: Record<string, string> = {
  ACCOUNT_DISABLED: 'The account is disabled.',
  INVALID_CREDENTIALS: 'The email or password was incorrect.',
  CURRENT_PASSWORD_INCORRECT: 'The current password was incorrect.',
  STOPPED_BY_ADMIN: 'The administrator ended the preview.',
  EXPIRED: 'The preview session expired.',
  TARGET_UNAVAILABLE: 'The previewed account was no longer available.',
}

const ENTITY_LABELS: Record<string, string> = {
  Lesson: 'Servants Prep lesson',
  SundaySchoolSession: 'Sunday School session',
  SundaySchoolRosterLink: 'Sunday School roster link',
  User: 'User account',
  SundaySchoolPriestNote: 'Confidential visitation note',
}

const METADATA_LABELS: Record<string, string> = {
  personCount: 'People included',
  saveCount: 'Saves bundled',
  attendanceDate: 'Attendance date',
  firstSavedAt: 'First saved',
  lastSavedAt: 'Last saved',
  provider: 'Sign-in method',
  readOnly: 'Read-only session',
  previousTargetUserId: 'Previous viewed user ID',
  previousTags: 'Previous roles',
  desiredTags: 'Updated roles',
  grantedTags: 'Roles added',
  revokedTags: 'Roles removed',
  previousCompatibilityRole: 'Previous primary role',
  compatibilityRole: 'Primary role',
  visitationId: 'Visitation ID',
  childId: 'Child ID',
  targetName: 'Record name',
  targetEmail: 'User email',
  bulkDelete: 'Bulk deletion',
  classId: 'Class ID',
  className: 'Class',
  opensAt: 'Check-in opens',
  expiresAt: 'Expires',
  requestCount: 'Requests reviewed',
  attendanceAddedCount: 'Attendance marks added',
  contactUpdateOnly: 'Contact updates only',
  maxUses: 'Maximum sign-ups',
}

export interface DisplayableAuditEvent {
  action: string
  result: 'SUCCESS' | 'DENIED' | 'FAILED'
  reason: string | null
  entityType: string
  entityId: string | null
  metadata: unknown
  target: { name: string | null; email: string } | null
}

export function humanizeAuditIdentifier(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
}

export function auditEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? humanizeAuditIdentifier(entityType)
}

export function auditTargetLabel(event: DisplayableAuditEvent): string {
  const metadata = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
    ? event.metadata as Record<string, unknown>
    : null
  const deletedTargetName = typeof metadata?.targetName === 'string' ? metadata.targetName
    : typeof metadata?.className === 'string' ? metadata.className : null
  const deletedTargetEmail = typeof metadata?.targetEmail === 'string' ? metadata.targetEmail : null
  return event.target?.name || event.target?.email || deletedTargetName || deletedTargetEmail || auditEntityLabel(event.entityType)
}

export function auditActionSummary(event: DisplayableAuditEvent): string {
  const target = auditTargetLabel(event)

  if (SESSION_ACTION_LABELS[event.action]) return `${SESSION_ACTION_LABELS[event.action]} for ${target}`
  if (event.action === 'sunday_school.attendance_qr.approved' || event.action === 'sunday_school.attendance_qr.dismissed') {
    const metadata = event.metadata as Record<string, unknown> | null
    const count = Number(metadata?.requestCount ?? 0)
    const verb = event.action.endsWith('.approved') ? 'Confirmed' : 'Dismissed'
    return `${verb} ${count} Sunday School QR check-in ${count === 1 ? 'request' : 'requests'}`
  }
  if (event.action === 'SUNDAY_SCHOOL_ROSTER_LINK_CREATED' || event.action === 'SUNDAY_SCHOOL_ROSTER_LINK_REVOKED') {
    const metadata = event.metadata as Record<string, unknown> | null
    const verb = event.action.endsWith('_CREATED') ? 'Created' : 'Revoked'
    const kind = metadata?.contactUpdateOnly === true ? 'contact-update QR code' : 'roster sign-up link'
    return `${verb} a ${kind} for ${target}`
  }

  if (event.action.startsWith('attendance.')) {
    const metadata = event.metadata as Record<string, unknown> | null
    const count = Number(metadata?.personCount ?? 0)
    if (event.action === 'attendance.sunday_school_children.qr_check_in') {
      return `Marked ${count} ${count === 1 ? 'person' : 'people'} present from Sunday School QR check-in`
    }
    const kind = event.action === 'attendance.prep.save' ? 'Servants Prep'
      : event.action === 'attendance.sunday_school_children.save' ? 'Sunday School children’s' : 'Sunday School servants’'
    return `Saved ${kind} attendance for ${count} ${count === 1 ? 'person' : 'people'}`
  }

  switch (event.action) {
    case 'AUTH_LOGIN':
      if (event.result === 'DENIED') return 'Sign-in attempt denied'
      if (event.result === 'FAILED') return 'Sign-in attempt failed'
      return 'Signed in'
    case 'AUTH_PASSWORD_CHANGE':
      if (event.result === 'DENIED') return 'Password change denied'
      if (event.result === 'FAILED') return 'Password change failed'
      return 'Changed password'
    case 'ADMIN_VIEW_AS_STARTED':
      return `Started viewing as ${target}`
    case 'ADMIN_VIEW_AS_SWITCHED':
      return `Switched View as to ${target}`
    case 'ADMIN_VIEW_AS_STOPPED':
      return `Stopped viewing as ${target}`
    case 'user.role_tags.update':
      return `Updated access roles for ${target}`
    case 'user.delete':
      return `Deleted user account for ${target}`
    case 'user.password_reset_email.send':
      return `Sent a password reset email to ${target}`
    default:
      return ACTION_LABELS[event.action] ?? humanizeAuditIdentifier(event.action)
  }
}

export function auditReasonLabel(reason: string | null): string | null {
  if (!reason) return null
  if (REASON_LABELS[reason]) return REASON_LABELS[reason]
  return /^[A-Z0-9_.-]+$/.test(reason) ? humanizeAuditIdentifier(reason) : reason
}

function formatMetadataValue(key: string, value: unknown): string {
  if (key === 'attendanceDate' && typeof value === 'string') return value
  if (['firstSavedAt', 'lastSavedAt', 'opensAt', 'expiresAt'].includes(key) && typeof value === 'string') {
    return new Date(value).toLocaleString()
  }
  if (key === 'provider') {
    if (value === 'credentials') return 'Email and password'
    if (value === 'google') return 'Google'
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    return value.length > 0
      ? value.map(item => typeof item === 'string' ? humanizeAuditIdentifier(item) : String(item)).join(', ')
      : 'None'
  }
  if (value === null || value === undefined || value === '') return 'None'
  if (typeof value === 'string' && /^[A-Z0-9_.-]+$/.test(value)) {
    return humanizeAuditIdentifier(value)
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function auditMetadataEntries(metadata: unknown): Array<{ label: string; value: string }> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []

  return Object.entries(metadata).map(([key, value]) => ({
    label: METADATA_LABELS[key] ?? humanizeAuditIdentifier(key),
    value: formatMetadataValue(key, value),
  }))
}
