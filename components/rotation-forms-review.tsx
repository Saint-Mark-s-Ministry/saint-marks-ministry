'use client'

import { useState } from 'react'
import { mutate as mutateCache } from 'swr'
import { toast } from 'sonner'
import { useSundaySchoolRotationForms } from '@/lib/swr'
import { nextRotationLevel } from '@/lib/rotation-forms'
import { getLevelDisplayName } from '@/lib/sunday-school-class'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import type { RotationFormReview } from '@/types/rotation-forms'

export function RotationFormsReview({ canReview }: { canReview: boolean }) {
  const { data: forms, error, isLoading, mutate } = useSundaySchoolRotationForms()
  const [selected, setSelected] = useState<RotationFormReview | null>(null)
  const [notes, setNotes] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)

  const review = async (status: 'APPROVED' | 'REJECTED') => {
    if (!selected || (status === 'APPROVED' && !confirmed)) return
    setBusy(true)
    try {
      const response = await fetch(`/api/sunday-school/rotation-forms/${selected.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes, version: selected.version, confirmedWeeks: status === 'APPROVED' ? 4 : undefined }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to review rotation form')
      toast.success(status === 'REJECTED' ? 'Form returned for correction' : result.rotationsComplete ? 'All ten rotations completed' : `Rotation approved. Next class: ${result.nextAssignment.class.name}`)
      setSelected(null)
      void mutate()
      void mutateCache(key => typeof key === 'string' && key.startsWith('/api/sunday-school/'))
      window.dispatchEvent(new Event('rotation-updated'))
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to review rotation form') }
    finally { setBusy(false) }
  }

  if (isLoading) return <PageLoading />
  if (error) return <Panel><EmptyState message="Could not load rotation forms." /><Button onClick={() => void mutate()}>Try again</Button></Panel>
  return <Panel title="Rotation forms" description="Students upload their signed four-week forms. Review all four signatures before approving a rotation and advancing the student to the next grade.">
    {!forms?.length ? <EmptyState message="No student submissions yet. Students upload their signed four-week form from Sunday School in their portal; it will appear here for review." /> : <ul className="divide-y divide-line">
      {forms.map(form => <li key={form.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="font-medium text-ink">{form.assignment.student.name} · {form.assignment.class?.name ?? form.assignment.grade}</p>
          <p className="text-sm text-ink-2">{form.status === 'PENDING' ? 'Awaiting review' : form.status === 'APPROVED' ? 'Approved' : 'Changes requested'}</p>
          {form.reviewNotes && <p className="text-sm text-ink-2">{form.reviewNotes}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><a href={form.fileUrl} target="_blank" rel="noreferrer">View signed form</a></Button>
          {canReview && form.status === 'PENDING' && form.assignment.isActive && <Button size="sm" onClick={() => { setSelected(form); setNotes(''); setConfirmed(false) }}>Review</Button>}
        </div>
      </li>)}
    </ul>}
    {selected && <div className="space-y-3 border-t border-line px-4 py-4">
      <p className="font-medium">Review {selected.assignment.student.name}&apos;s four-week form</p>
      <p className="text-sm text-ink-2">Next grade: {getLevelDisplayName(nextRotationLevel(selected.level))}. If this completes all ten grades, the rotation program will finish.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} className="mt-1" />I verified that all four weeks were fully attended and signed.</label>
      <label htmlFor="rotation-review-notes" className="block text-sm font-medium">Review notes (required when returning a form)</label>
      <Input id="rotation-review-notes" value={notes} onChange={event => setNotes(event.target.value)} disabled={busy} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!confirmed || busy} onClick={() => void review('APPROVED')}>Approve and advance</Button>
        <Button variant="outline" disabled={!notes.trim() || busy} onClick={() => void review('REJECTED')}>Return for correction</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setSelected(null)}>Cancel</Button>
      </div>
    </div>}
  </Panel>
}
