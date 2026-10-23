'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import type { SundaySchoolHomeworkCompletionStatus } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getChildFullName } from '@/lib/sunday-school-class'
import { cn, formatDateUTC } from '@/lib/utils'
import type { SundaySchoolHomeworkWeek } from '@/types/sunday-school'

type Mark = SundaySchoolHomeworkCompletionStatus | null

/**
 * Record who did the homework that is due at this meeting, from Home: one tap
 * per child. Saves only the children whose mark changed, through the same
 * completions endpoint as the Homework page.
 */
export function HomeworkRecordDialog({ week, roster, onSaved }: {
  week: SundaySchoolHomeworkWeek & { homework: NonNullable<SundaySchoolHomeworkWeek['homework']> }
  roster: Array<{ id: string; firstName: string; lastName: string }>
  onSaved: () => void
}) {
  const saved = () => Object.fromEntries(week.homework.completions.map(c => [c.childId, c.status])) as Record<string, Mark>
  const [open, setOpen] = useState(false)
  const [marks, setMarks] = useState<Record<string, Mark>>(saved)
  const [saving, setSaving] = useState(false)

  const openDialog = () => {
    setMarks(saved())
    setOpen(true)
  }

  const save = async () => {
    const before = saved()
    const records = roster
      .filter(child => (marks[child.id] ?? null) !== (before[child.id] ?? null))
      .map(child => ({ childId: child.id, status: marks[child.id] ?? null }))
    if (records.length === 0) return setOpen(false)
    setSaving(true)
    try {
      const response = await fetch(`/api/sunday-school/homework/${week.homework.id}/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not save homework')
      toast.success('Homework recorded')
      setOpen(false)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save homework')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (childId: string, status: SundaySchoolHomeworkCompletionStatus) =>
    setMarks(current => ({ ...current, [childId]: current[childId] === status ? null : status }))

  return (
    <>
      <Button size="sm" onClick={openDialog}>Record</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Who did the homework?</DialogTitle>
            <DialogDescription>
              {week.homework.title} · due {formatDateUTC(week.dueDate, { year: undefined })}. Tap again to clear.
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-line">
            {roster.map(child => {
              const name = getChildFullName(child)
              const mark = marks[child.id] ?? null
              return (
                <li key={child.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-[14px] text-ink">{name}</span>
                  <span className="flex shrink-0 gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={mark === 'COMPLETED'}
                      aria-label={`${name} did it`}
                      className={cn(mark === 'COMPLETED' && 'border-ok bg-ok text-white hover:bg-ok hover:text-white')}
                      onClick={() => toggle(child.id, 'COMPLETED')}
                    >
                      <Check /> Done
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={mark === 'NOT_COMPLETED'}
                      aria-label={`${name} did not do it`}
                      className={cn(mark === 'NOT_COMPLETED' && 'border-bad bg-bad text-white hover:bg-bad hover:text-white')}
                      onClick={() => toggle(child.id, 'NOT_COMPLETED')}
                    >
                      <X /> Not done
                    </Button>
                  </span>
                </li>
              )
            })}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
