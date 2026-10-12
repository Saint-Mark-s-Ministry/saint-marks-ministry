import { AuditEventResult, type Prisma } from '@prisma/client'
import { recordAuditEvent } from '@/lib/audit'

export const ATTENDANCE_AUDIT_ACTIONS = [
  'attendance.prep.save',
  'attendance.sunday_school_children.save',
  'attendance.sunday_school_servants.save',
]

export async function recordAttendanceAudit(input: {
  actorUserId: string
  action: string
  entityType: string
  entityId: string
  targetName: string
  attendanceDate: Date
  personIds: string[]
}) {
  if (!input.personIds.length) return
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    result: AuditEventResult.SUCCESS,
    metadata: {
      targetName: input.targetName,
      attendanceDate: input.attendanceDate.toISOString().slice(0, 10),
      personIds: [...new Set(input.personIds)],
    },
  })
}

interface AttendanceAuditRow {
  id: string
  actorUserId: string | null
  action: string
  entityType: string
  entityId: string | null
  result: string
  createdAt: Date
  metadata: Prisma.JsonValue
}

// Input is newest first. Group before pagination so a roll call never spills
// across pages. Raw audit events remain unchanged.
export function bundleAttendanceEvents<T extends AttendanceAuditRow>(events: T[]): T[] {
  const groups: T[] = []
  const active = new Map<string, { row: T; oldest: number; people: Set<string> }>()
  for (const event of events) {
    const metadata: Prisma.JsonObject = event.metadata && typeof event.metadata === 'object' && !Array.isArray(event.metadata)
      ? event.metadata : {}
    const people = Array.isArray(metadata.personIds)
      ? metadata.personIds.filter((id): id is string => typeof id === 'string') : []
    const key = JSON.stringify([event.actorUserId, event.action, event.entityType, event.entityId])
    const previous = active.get(key)
    const time = event.createdAt.getTime()
    if (previous && previous.oldest - time <= 5 * 60 * 1000) {
      people.forEach(id => previous.people.add(id))
      const summary = previous.row.metadata as Prisma.JsonObject
      previous.row.metadata = {
        ...summary,
        personCount: previous.people.size,
        saveCount: Number(summary.saveCount) + 1,
        firstSavedAt: event.createdAt.toISOString(),
      }
      previous.oldest = time
    } else {
      const summary: Prisma.JsonObject = {
        ...metadata,
        personCount: new Set(people).size,
        saveCount: 1,
        firstSavedAt: event.createdAt.toISOString(),
        lastSavedAt: event.createdAt.toISOString(),
      }
      delete summary.personIds
      const row = { ...event, metadata: summary }
      groups.push(row)
      active.set(key, { row, oldest: time, people: new Set(people) })
    }
  }
  return groups
}
