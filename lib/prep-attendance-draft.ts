import type { AttendanceSaveInfo } from '@/lib/attendance-save-info'

export interface PrepAttendanceRecord {
  studentId: string
  status: 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'
  arrivedAt?: string | null
  notes?: string | null
  conductRemoval?: boolean
  conductNote?: string | null
  updatedAt?: string
  recorder?: AttendanceSaveInfo['recorder']
}
export type PrepAttendanceDraft = Record<string, PrepAttendanceRecord>

export function prepAttendanceDraftKey(userId: string, lessonId: string) {
  return `prep-attendance:v1:${JSON.stringify([userId, lessonId])}`
}

// Persist only unsent edits, without names, contact details or recorder data.
export function draftRecord(record: PrepAttendanceRecord): PrepAttendanceRecord {
  return {
    studentId: record.studentId, status: record.status,
    arrivedAt: record.arrivedAt ?? null, notes: record.notes ?? null,
    conductRemoval: record.conductRemoval === true, conductNote: record.conductNote ?? null,
  }
}
export function recordVersion(record: PrepAttendanceRecord) {
  return JSON.stringify(draftRecord(record))
}

export function readPrepAttendanceDraft(key: string): PrepAttendanceDraft {
  const raw = localStorage.getItem(key)
  if (!raw) return {}
  const data: unknown = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error('Invalid attendance draft')
  return Object.fromEntries(data.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid attendance draft')
    const r = entry as Record<string, unknown>
    if (typeof r.studentId !== 'string' || !r.studentId || !['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'].includes(String(r.status)) ||
      ['arrivedAt', 'notes', 'conductNote'].some(k => (r[k] !== null && r[k] !== undefined) && typeof r[k] !== 'string') ||
      ((r.conductRemoval !== null && r.conductRemoval !== undefined) && typeof r.conductRemoval !== 'boolean')) throw new Error('Invalid attendance draft')
    const record = draftRecord(r as unknown as PrepAttendanceRecord)
    return [record.studentId, record]
  }))
}
