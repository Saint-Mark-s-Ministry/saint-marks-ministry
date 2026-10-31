'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SundaySchoolCareEditor, CALL_OUTCOME_LABELS } from '@/components/sunday-school-care-editor'
import { useStudentHistory } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'

export { CALL_OUTCOME_LABELS } from '@/components/sunday-school-care-editor'

interface CallDialogProps {
  child: { id: string; name: string; canEdit: boolean }
  viewerId: string
  onClose: () => void
  onSaved: () => Promise<unknown>
}

export function SundaySchoolCallDialog({ child, viewerId, onClose, onSaved }: CallDialogProps) {
  const { data, error, isLoading, mutate } = useStudentHistory({ id: child.id, name: child.name, program: 'sunday-school' }, viewerId)
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent scrollable className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calls · {child.name}</DialogTitle>
          <DialogDescription>Log a call and review previous follow-up without leaving Care.</DialogDescription>
        </DialogHeader>
        {error ? <p role="alert" className="text-sm text-bad">Couldn’t load this child’s call history. Close and try again.</p> : isLoading ? <p role="status" className="text-sm text-ink-3">Loading call history…</p> : data && (
          <div className="space-y-5">
            {child.canEdit && <SundaySchoolCareEditor childId={child.id} allowVisits={false} onSaved={async () => { await Promise.all([mutate(), onSaved()]) }} />}
            <section className="space-y-3" aria-label="Phone call history">
              <h3 className="text-sm font-semibold">Phone call history</h3>
              {data.phoneCalls.length === 0 ? <p className="text-sm text-ink-3">No phone calls recorded yet.</p> : (
                <ul className="space-y-3">
                  {data.phoneCalls.map(call => (
                    <li key={call.id} className="space-y-2 rounded-lg border border-line p-3 text-sm">
                      <p className="font-medium">{CALL_OUTCOME_LABELS[call.outcome]} · {formatDateUTC(call.calledAt)}</p>
                      <p className="whitespace-pre-wrap text-ink-2">{call.note}</p>
                      <p className="text-xs text-ink-3">Called by {call.callerName}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
