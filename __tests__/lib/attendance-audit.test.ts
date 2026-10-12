import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/audit', () => ({ recordAuditEvent: vi.fn() }))
import { bundleAttendanceEvents, recordAttendanceAudit } from '@/lib/attendance-audit'
import { recordAuditEvent } from '@/lib/audit'

const row = (id: string, minute: number, people: string[], overrides = {}) => ({
  id, actorUserId: 'user-1', action: 'attendance.prep.save',
  entityType: 'Lesson', entityId: 'lesson-1', result: 'SUCCESS',
  createdAt: new Date(`2026-10-12T12:${String(minute).padStart(2, '0')}:00Z`),
  metadata: { targetName: 'Lesson one', personIds: people }, ...overrides,
})

describe('attendance activity', () => {
  it('bundles ongoing saves and counts each person once without mutating raw events', () => {
    const events = [row('3', 10, ['a']), row('2', 6, ['b']), row('1', 2, ['a'])]
    const groups = bundleAttendanceEvents(events)
    expect(groups).toHaveLength(1)
    expect(groups[0].metadata).toMatchObject({ personCount: 2, saveCount: 3,
      firstSavedAt: '2026-10-12T12:02:00.000Z', lastSavedAt: '2026-10-12T12:10:00.000Z' })
    expect(groups[0].metadata).not.toHaveProperty('personIds')
    expect(events[0].metadata).toHaveProperty('personIds')
  })

  it('separates people taking attendance, scopes, modes, and gaps over five minutes', () => {
    const events = [row('5', 20, ['a']), row('4', 19, ['b'], { actorUserId: 'user-2' }),
      row('3', 18, ['c'], { entityId: 'lesson-2' }),
      row('2', 17, ['d'], { action: 'attendance.sunday_school_children.save' }), row('1', 10, ['e'])]
    expect(bundleAttendanceEvents(events)).toHaveLength(5)
  })

  it('records a whole batch once and skips empty saves', async () => {
    const input = { actorUserId: 'user-1', action: 'attendance.prep.save', entityType: 'Lesson',
      entityId: 'lesson-1', targetName: 'Lesson one', attendanceDate: new Date('2026-10-12'), personIds: ['a', 'b'] }
    await recordAttendanceAudit(input)
    await recordAttendanceAudit({ ...input, personIds: [] })
    expect(recordAuditEvent).toHaveBeenCalledOnce()
    expect(recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 'user-1', metadata: { targetName: 'Lesson one', attendanceDate: '2026-10-12', personIds: ['a', 'b'] },
    }))
  })
})
