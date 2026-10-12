export interface AttendanceSaveInfo {
  savedAt: string
  recorder: { id: string; name: string | null } | null
}

// Use attendance rows, not session.updatedAt: opening or editing a session
// must not be presented as an attendance save.
export function latestAttendanceSave(records: Array<{
  updatedAt?: Date | string
  recorder?: AttendanceSaveInfo['recorder']
}>): AttendanceSaveInfo | null {
  let latest: AttendanceSaveInfo | null = null
  for (const record of records) {
    if (!record.updatedAt) continue
    const date = new Date(record.updatedAt)
    if (!Number.isFinite(date.getTime())) continue
    if (!latest || date.getTime() > new Date(latest.savedAt).getTime()) {
      latest = { savedAt: date.toISOString(), recorder: record.recorder ?? null }
    }
  }
  return latest
}
