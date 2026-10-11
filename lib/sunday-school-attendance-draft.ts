import type { AttendanceStatus } from '@prisma/client'

export type AttendanceMarks = Record<string, AttendanceStatus>

// Only identifiers and marks are persisted, never roster names or family/contact data.
export function attendanceDraftKey(userId: string, classId: string, date: string) {
  return `sunday-school-child-attendance:v1:${JSON.stringify([userId, classId, date])}`
}

export function readAttendanceDraft(storage: Pick<Storage, 'getItem'>, key: string): AttendanceMarks {
  const raw = storage.getItem(key)
  if (!raw) return {}
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid attendance draft')
  const marks: AttendanceMarks = {}
  for (const [id, status] of Object.entries(value)) {
    if (!id || !['PRESENT', 'LATE', 'ABSENT'].includes(String(status))) {
      throw new Error('Invalid attendance draft')
    }
    Object.defineProperty(marks, id, { value: status, enumerable: true, configurable: true, writable: true })
  }
  return marks
}

export function mergeAttendanceDraft(saved: AttendanceMarks, draft: AttendanceMarks, rosterIds: string[]) {
  const marks: AttendanceMarks = {}
  const pending: AttendanceMarks = {}
  const roster = new Set(rosterIds)
  for (const id of rosterIds) {
    if (saved[id]) marks[id] = saved[id]
    if (draft[id]) {
      marks[id] = draft[id]
      pending[id] = draft[id]
    }
  }
  return { marks, pending, removedCount: Object.keys(draft).filter(id => !roster.has(id)).length }
}
