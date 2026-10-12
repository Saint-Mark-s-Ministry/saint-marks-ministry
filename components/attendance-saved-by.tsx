import type { AttendanceSaveInfo } from '@/lib/attendance-save-info'

export function AttendanceSavedBy({ info }: { info: AttendanceSaveInfo | null | undefined }) {
  if (info === undefined) return null
  if (!info) return <p className="text-xs text-ink-3">Attendance not saved yet.</p>
  return (
    <p className="text-xs text-ink-3">
      Last saved by <span className="font-medium text-ink-2">{info.recorder?.name || 'Unknown recorder'}</span>
      {' · '}<time dateTime={info.savedAt}>{new Date(info.savedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}</time>
    </p>
  )
}
