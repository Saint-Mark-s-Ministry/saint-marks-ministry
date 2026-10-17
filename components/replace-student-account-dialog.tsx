'use client'

import { useState, type ReactNode } from 'react'
import type { YearLevel } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'

export function ReplaceStudentAccountDialog({ applicant, oldAccount, yearLevel, busy, onConfirm, children }: {
  applicant: { name: string; email: string }
  oldAccount: { id: string; name: string | null; email: string }
  yearLevel: YearLevel | 'ASYNC'
  children?: ReactNode
  busy: boolean
  onConfirm: (oldUserId: string, migrateHistory: boolean) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<'transfer' | 'discard' | ''>('')
  return (
    <AlertDialog open={open} onOpenChange={value => { setOpen(value); if (value) setChoice('') }}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={busy}>Approve and replace old account</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>Transfer the student’s old SP information?</AlertDialogTitle>
          <AlertDialogDescription>
            Approve {applicant.name} ({applicant.email}) at {yearLevel === 'ASYNC' ? 'Async' : yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} and replace {oldAccount.name} ({oldAccount.email}). Confirm that both accounts belong to the same person.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <fieldset disabled={busy} className="space-y-3">
          <legend className="mb-3 text-sm font-medium">What should happen to the old account’s SP records?</legend>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input type="radio" name={`history-${oldAccount.id}`} value="transfer" checked={choice === 'transfer'} onChange={() => setChoice('transfer')} className="mt-1" />
            <span className="space-y-1 text-sm">
              <span className="block font-medium">Yes, transfer SP history (recommended)</span>
              <span className="block text-muted-foreground">Keep attendance, exam scores and notes, slips, expected absences, serving records, mentor history, and previous applications. Keep the existing enrollment settings with the year level selected above.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
            <input type="radio" name={`history-${oldAccount.id}`} value="discard" checked={choice === 'discard'} onChange={() => setChoice('discard')} className="mt-1" />
            <span className="space-y-1 text-sm">
              <span className="block font-medium">No, start with a fresh SP record</span>
              <span className="block text-muted-foreground">The old account’s enrollment, attendance, exam scores, and associated records will be permanently deleted. This cannot be undone.</span>
            </span>
          </label>
        </fieldset>
        <p className="text-sm text-muted-foreground">The old login will be deleted after approval. The new account will receive a temporary password.</p>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !choice}
            onClick={async event => {
              event.preventDefault()
              if (!choice || busy) return
              if (await onConfirm(oldAccount.id, choice === 'transfer')) setOpen(false)
            }}
          >
            {busy ? 'Approving...' : choice === 'discard' ? 'Approve and delete old records' : 'Approve and transfer SP history'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
