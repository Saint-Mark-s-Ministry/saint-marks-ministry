import { AttendanceSavedBy } from '@/components/attendance-saved-by'
import type { AttendanceSaveInfo } from '@/lib/attendance-save-info'
import { Button } from '@/components/ui/button'

interface SundaySchoolAttendanceSaveBarProps {
  presentCount: number
  rosterCount: number
  unmarkedCount: number
  pendingCount: number
  saving: boolean
  lastSavedBy: AttendanceSaveInfo | null
  saveError: boolean
  recovered: boolean
  disabled: boolean
  onSave: () => void
}

/**
 * Marks already save on their own; Finish is the deliberate last step that
 * records anyone still unmarked as absent. Stack details above the action on
 * phones; reserve space during autosaves.
 */
export function SundaySchoolAttendanceSaveBar({
  presentCount, rosterCount, unmarkedCount, pendingCount, saving, lastSavedBy,
  saveError, recovered, disabled, onSave,
}: SundaySchoolAttendanceSaveBarProps) {
  const saveStatus = saving ? 'Saving marks…'
    : recovered && pendingCount ? 'Review recovered marks'
    : saveError ? 'Waiting to save'
    : pendingCount ? `${pendingCount} pending`
    : null

  return (
    <div className="sticky bottom-2 z-30 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
      <p className="tabular col-start-1 row-start-1 h-5 truncate whitespace-nowrap text-[13px] leading-5 text-ink-2" aria-live="polite">
        <b className="font-semibold text-ok">{presentCount}</b> of {rosterCount} here
        <span className="ml-2 text-ink-3">· {unmarkedCount} unmarked</span>
      </p>
      <div role="status" title={saveStatus ?? undefined} className="tabular col-start-1 row-start-2 min-h-10 min-w-0 break-words text-xs leading-5 text-ink-3 sm:min-h-5 [&>p]:leading-5">
        {saveStatus ?? <AttendanceSavedBy info={lastSavedBy} />}
      </div>
      <Button
        onClick={onSave}
        disabled={disabled}
        aria-label={unmarkedCount > 0 ? `Finish attendance and mark ${unmarkedCount} absent` : 'Finish attendance'}
        className="col-start-1 row-start-3 w-full sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:w-auto sm:min-w-36"
      >
        {saving ? 'Saving…' : unmarkedCount > 0 ? `Finish · mark ${unmarkedCount} absent` : 'Finish'}
      </Button>
    </div>
  )
}
