'use client'

import { useState } from 'react'
import { CalendarPlus, Copy, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useBirthdayCalendarSubscription } from '@/lib/swr'
import { calendarSubscriptionLinks } from '@/lib/liturgical'

export function SundaySchoolBirthdaySubscribe({ classes, selectedClassId, viewingAs = false }: {
  classes: Array<{ id: string; name: string }>
  selectedClassId?: string
  viewingAs?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [classId, setClassId] = useState(selectedClassId || (classes.length === 1 ? classes[0].id : ''))
  const { trigger, data, error, isMutating, reset } = useBirthdayCalendarSubscription(classId)
  const cls = classes.find(item => item.id === classId)
  const links = data ? calendarSubscriptionLinks(data.feedUrl) : null
  const localFeed = data && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(data.feedUrl).hostname)

  const copy = async (feedUrl: string, calendarName: string) => {
    try {
      await navigator.clipboard.writeText(feedUrl)
      toast.success(`${calendarName} calendar link copied`)
    } catch { toast.error('Could not copy the calendar link. Please try again.') }
  }

  return (
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { reset() } }}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={viewingAs || classes.length === 0}
        title={viewingAs ? 'Stop View as to subscribe to your own class calendar.' : undefined}>
        <CalendarPlus aria-hidden />Add birthdays to calendar
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add birthdays to your calendar</DialogTitle>
          <DialogDescription>Keep your class’s birthdays in your phone calendar. Birthday changes appear when your calendar app refreshes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="birthday-calendar-class">Class</Label>
            <select id="birthday-calendar-class" value={classId} disabled={isMutating}
              onChange={event => { reset(); setClassId(event.target.value) }}
              className="h-11 w-full rounded-md border border-line-strong bg-surface px-3 text-base text-ink">
              <option value="">Choose a class</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          {!links ? (
            <Button className="w-full" disabled={!cls || isMutating} onClick={() => void trigger().catch(() => {})}>
              {isMutating && <LoaderCircle className="animate-spin" aria-hidden />}
              {isMutating ? 'Preparing calendar…' : 'Get subscription link'}
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">{data?.className} birthdays</p>
              {localFeed ? (
                <p role="status" className="rounded-md bg-warn-tint p-3 text-sm text-ink">Phone subscriptions will work after this update is published. This local preview link can only be reached on this computer.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild><a href={links.webcal}>Open Apple Calendar / Outlook</a></Button>
                  <Button asChild variant="outline"><a href={links.google} target="_blank" rel="noreferrer">Open Google Calendar</a></Button>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => data && void copy(data.feedUrl, 'Birthday')}><Copy aria-hidden />Copy calendar link</Button>
              <label className="block space-y-1 text-xs text-ink-3">
                <span>Subscription URL</span>
                <input readOnly value={data?.feedUrl ?? ''} onFocus={event => event.target.select()}
                  className="h-10 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
              </label>
              <p className="text-xs leading-5 text-ink-3">Apple Calendar: Calendars → Add Calendar → Add Subscription Calendar. For Google Calendar, add the URL using a computer browser; it will then appear in the phone app.</p>
              <p className="text-xs leading-5 text-ink-3">Keep this personal link private. It gives read-only access to this class’s children’s names and birthday dates. It stops working if your class access is removed or your password changes.</p>
            </div>
          )}
          <p className="text-xs text-ink-3">Anyone with this personal link can read these birthdays. It expires 31 days after the academic year ends; return here to renew for your next class. Set reminders in your calendar app.</p>
          {error && <p role="alert" className="text-sm text-bad">Could not prepare this calendar. Please try again.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
