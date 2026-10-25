'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { StudentName } from '@/components/student-history-provider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { birthdayGreeting } from '@/lib/sunday-school-birthdays'
import { detectContactPlatform, smsHref } from '@/lib/contact-links'
import { useBirthdayTextContact } from '@/lib/swr'

export function SundaySchoolBirthdayActions({ child, onClose }: {
  child: { id: string; firstName: string; lastName: string }
  onClose: () => void
}) {
  const { data: session } = useSession()
  const { data, error, isLoading, isValidating } = useBirthdayTextContact(child.id, session?.user.id)
  const [draft, setDraft] = useState(() => birthdayGreeting(child.firstName))
  const busy = isLoading || isValidating || !session
  const platform = typeof navigator === 'undefined' ? 'desktop' : detectContactPlatform(navigator)
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(draft)
      toast.success('Birthday message copied')
    } catch {
      toast.error('Could not copy. Select and copy the message above.')
    }
  }
  const href = !busy && !error && data?.cellPhone ? smsHref(data.cellPhone, platform, draft) : null
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Birthday greeting for {child.firstName}</DialogTitle>
        <DialogDescription>Edit your greeting, then open your messaging app to review and send it.</DialogDescription>
      </DialogHeader>
      <StudentName id={child.id} name={`${child.firstName} ${child.lastName}`} />
      <label className="space-y-2 text-sm">Birthday message
        <textarea className="mt-2 min-h-32 w-full rounded-md border border-line bg-surface p-3 text-ink" value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      {busy ? <p role="status">Loading contact…</p> : error ? <p role="alert">Could not load this child’s contact. You can still copy the greeting.</p> : !href ? <p>No usable child phone number is recorded. You can copy the greeting instead.</p> : <p className="text-sm text-ink-3">To the child’s phone: {data?.cellPhone}</p>}
      {href && draft.trim() && <Button asChild><a href={href}>Send birthday text</a></Button>}
      <Button variant="outline" disabled={!draft.trim()} onClick={() => void copyMessage()}>Copy message</Button>
      <p className="text-xs text-ink-3">Your messaging app sends the message only after you press Send. On a device without messaging, use Copy message.</p>
    </DialogContent>
  </Dialog>
}
