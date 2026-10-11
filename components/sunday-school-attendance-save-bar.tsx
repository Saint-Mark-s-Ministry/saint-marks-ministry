import { Button } from '@/components/ui/button'

interface SundaySchoolAttendanceSaveBarProps {
  presentCount: number
  rosterCount: number
  unmarkedCount: number
  pendingCount: number
  saving: boolean
  lastSaved: Date | null
  saveError: boolean
  recovered: boolean
  disabled: boolean
  onSave: () => void
}

/** Reserve both text rows and the button width throughout every autosave phase. */
export function SundaySchoolAttendanceSaveBar({
  presentCount, rosterCount, unmarkedCount, pendingCount, saving, lastSaved,
  saveError, recovered, disabled, onSave,
}: SundaySchoolAttendanceSaveBarProps) {
  const saveStatus = saving ? 'Saving marks…'
    : recovered && pendingCount ? 'Review recovered marks'
    : saveError ? 'Waiting to save'
    : pendingCount ? `${pendingCount} pending`
    : lastSaved ? `Saved at ${lastSaved.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
    : 'Ready to mark'

  return (
    <div className="sticky bottom-2 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-line bg-surface px-4 py-3 shadow-[0_8px_24px_-12px_rgba(27,24,23,0.25)] md:bottom-4">
      <p className="tabular col-span-2 h-5 truncate whitespace-nowrap text-[13px] leading-5 text-ink-2 sm:col-span-1" aria-live="polite">
        <b className="font-semibold text-ok">{presentCount}</b> of {rosterCount} here
        <span className="ml-2 text-ink-3">· {unmarkedCount} unmarked</span>
      </p>
      <p role="status" title={saveStatus} className="tabular col-start-1 row-start-2 h-5 min-w-0 truncate whitespace-nowrap text-xs leading-5 text-ink-3">
        {saveStatus}
      </p>
      <Button onClick={onSave} disabled={disabled} className="col-start-2 row-start-2 w-36 sm:row-span-2 sm:row-start-1">
        {saving ? 'Saving…' : 'Save attendance'}
      </Button>
    </div>
  )
}
