'use client'

import { useId, useState } from 'react'
import { SundaySchoolPhoneCallOutcome, SundaySchoolVisitationStatus } from '@prisma/client'
import { mutate as mutateCache } from 'swr'
import { toast } from 'sonner'
import { Segmented } from '@/components/ds/segmented'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getCheckInWeek } from '@/lib/sunday-school-check-ins'

export const CALL_OUTCOME_LABELS: Record<SundaySchoolPhoneCallOutcome, string> = {
  CONNECTED: 'Connected', LEFT_VOICEMAIL: 'Left voicemail', NO_ANSWER: 'No answer', OTHER: 'Other',
}

/** Shared by the compact call dialog and the child's Care tab. */
export function SundaySchoolCareEditor({ childId, allowVisits = true, onSaved }: {
  childId: string
  allowVisits?: boolean
  onSaved: () => Promise<unknown>
}) {
  const id = useId()
  const today = getCheckInWeek().today.toISOString().slice(0, 10)
  const [kind, setKind] = useState<'call' | 'visit'>('call')
  const [date, setDate] = useState(today)
  const [outcome, setOutcome] = useState<SundaySchoolPhoneCallOutcome>(SundaySchoolPhoneCallOutcome.CONNECTED)
  const [status, setStatus] = useState<SundaySchoolVisitationStatus>(SundaySchoolVisitationStatus.DONE)
  const [note, setNote] = useState('')
  const [privateNote, setPrivateNote] = useState('')
  const [saving, setSaving] = useState(false)
  const call = kind === 'call'
  const limit = call ? 500 : 5000
  const selectClass = 'h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] md:h-8 md:text-[13px]'

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await fetch(call ? '/api/sunday-school/phone-calls' : '/api/sunday-school/visitations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(call ? { childId, calledAt: date, outcome, note } : { childId, status, visitedAt: status === 'DONE' ? date : null, notes: note, privateNote }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not save the entry')
      setNote('')
      setPrivateNote('')
      toast.success(call ? 'Phone call logged' : 'Visitation saved')
      await Promise.all([
        onSaved(),
        mutateCache('/api/sunday-school/visitations?view=follow-up'),
        mutateCache('/api/sunday-school/visitations'),
        mutateCache(key => typeof key === 'string' && key.startsWith('/api/sunday-school/follow-up-assignments')),
      ])
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save the entry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-line bg-hover/40 p-4">
      {allowVisits ? <Segmented label="Log contact" value={kind} onChange={setKind} options={[{ value: 'call', label: 'Phone call' }, { value: 'visit', label: 'Visit' }]} /> : <h3 className="text-sm font-semibold">Log a phone call</h3>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(call || status === 'DONE') && <div className="space-y-1.5">
          <Label htmlFor={`${id}-date`}>{call ? 'Date called' : 'Date visited'}</Label>
          <Input id={`${id}-date`} type="date" value={date} max={today} required disabled={saving} onChange={event => setDate(event.target.value)} />
        </div>}
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-outcome`}>{call ? 'Outcome' : 'Visit status'}</Label>
          {call ? <select id={`${id}-outcome`} value={outcome} disabled={saving} onChange={event => setOutcome(event.target.value as SundaySchoolPhoneCallOutcome)} className={selectClass}>
            {Object.values(SundaySchoolPhoneCallOutcome).map(value => <option key={value} value={value}>{CALL_OUTCOME_LABELS[value]}</option>)}
          </select> : <select id={`${id}-outcome`} value={status} disabled={saving} onChange={event => setStatus(event.target.value as SundaySchoolVisitationStatus)} className={selectClass}>
            <option value="DONE">Done</option><option value="NOT_DONE">Not done</option>
          </select>}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{call ? 'Call note' : 'Visit notes (optional)'}</Label>
        <Textarea id={`${id}-note`} value={note} disabled={saving} onChange={event => setNote(event.target.value)} placeholder="Conversation summary or next step…" rows={3} required={call} maxLength={limit} />
        <p className="text-right text-xs text-ink-3">{note.length}/{limit.toLocaleString()}</p>
      </div>
      {!call && <div className="space-y-1.5">
        <Label htmlFor={`${id}-private`}>Private note to priests (optional)</Label>
        <Textarea id={`${id}-private`} value={privateNote} disabled={saving} onChange={event => setPrivateNote(event.target.value)} rows={3} maxLength={5000} />
        <p className="text-xs text-ink-3">Only priests and the author can read this note. Super Admins cannot read confidential notes.</p>
      </div>}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving || ((call || status === 'DONE') && !date) || (call && !note.trim()) || note.length > limit}>{saving ? 'Saving…' : call ? 'Save call' : 'Save visit'}</Button>
      </div>
    </form>
  )
}
