import { describe, expect, it } from 'vitest'
import { latestAttendanceSave } from '@/lib/attendance-save-info'

describe('latest attendance save', () => {
  it('selects the latest save and its recorder, regardless of roster order', () => {
    const latest = { id: 'latest', name: 'Latest Servant' }
    expect(latestAttendanceSave([
      { updatedAt: new Date('2026-10-11T12:30Z'), recorder: latest },
      { updatedAt: '2026-10-11T12:00Z', recorder: { id: 'first', name: 'First Servant' } },
    ])).toEqual({ savedAt: '2026-10-11T12:30:00.000Z', recorder: latest })
  })
  it('does not invent attribution for missing or deleted recorders', () => {
    expect(latestAttendanceSave([])).toBeNull()
    expect(latestAttendanceSave([{ updatedAt: 'invalid' }])).toBeNull()
    expect(latestAttendanceSave([{ updatedAt: '2026-10-11T12:00Z', recorder: null }]))
      .toEqual({ savedAt: '2026-10-11T12:00:00.000Z', recorder: null })
  })
})
