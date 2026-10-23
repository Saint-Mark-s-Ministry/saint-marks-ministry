'use client'

import { useState } from 'react'
import { CalendarPlus, Copy, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useLessonCalendarSubscription } from '@/lib/swr'
import { calendarSubscriptionLinks } from '@/lib/liturgical'

export function SundaySchoolLessonSubscribe({ classes, selectedClassId, viewingAs = false }: {
  classes: Array<{ id: string; name: string }>
  selectedClassId?: string
  viewingAs?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [includeCopticCalendar, setIncludeCopticCalendar] = useState(false)
  const [classId, setClassId] = useState(selectedClassId || (classes.length === 1 ? classes[0].id : ''))
  const { trigger, data, error, isMutating, reset } = useLessonCalendarSubscription(classId)
  const churchLinks = calendarSubscriptionLinks()
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
    <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { reset(); setIncludeCopticCalendar(false) } }}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={viewingAs || classes.length === 0}
        title={viewingAs ? 'Stop View as to subscribe to your own class calendar.' : undefined}>
        <CalendarPlus aria-hidden />Add lessons to calendar
      </Button>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add lessons to your calendar</DialogTitle>
          <DialogDescription>Keep your class’s lesson schedule in your phone calendar. Lesson changes appear when your calendar app refreshes.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lesson-calendar-class">Class</Label>
            <select id="lesson-calendar-class" value={classId} disabled={isMutating}
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
              <p className="text-sm font-medium text-ink">{data?.className} lessons</p>
              {localFeed ? (
                <p role="status" className="rounded-md bg-warn-tint p-3 text-sm text-ink">Phone subscriptions will work after this update is published. This local preview link can only be reached on this computer.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild><a href={links.webcal}>Open Apple Calendar / Outlook</a></Button>
                  <Button asChild variant="outline"><a href={links.google} target="_blank" rel="noreferrer">Open Google Calendar</a></Button>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => data && void copy(data.feedUrl, 'Lesson')}><Copy aria-hidden />Copy calendar link</Button>
              <label className="block space-y-1 text-xs text-ink-3">
                <span>Subscription URL</span>
                <input readOnly value={data?.feedUrl ?? ''} onFocus={event => event.target.select()}
                  className="h-10 w-full rounded-md border border-line-strong bg-surface px-2 text-sm text-ink" />
              </label>
              <p className="text-xs leading-5 text-ink-3">Apple Calendar: Calendars → Add Calendar → Add Subscription Calendar. For Google Calendar, add the URL using a computer browser; it will then appear in the phone app.</p>
              <p className="text-xs leading-5 text-ink-3">Keep this personal link private. It gives read-only access to this class’s lesson dates and titles. It stops working if your class access is removed or your password changes.</p>
            </div>
          )}
          <div className="space-y-3 border-t border-line pt-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={includeCopticCalendar}
                onChange={event => setIncludeCopticCalendar(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-brand" />
              Also add the Coptic Orthodox calendar
            </label>
            <p className="text-xs leading-5 text-ink-3">Feasts, fasts, and seasons from Coptic.io.</p>
            {includeCopticCalendar && (
              <section aria-label="Coptic Orthodox calendar subscription" className="space-y-3 rounded-md border border-line p-3">
                <p className="text-sm leading-5 text-ink-2">Add this as a second calendar so you can show or hide church dates separately from lessons. Your calendar app will ask you to confirm each subscription.</p>
                <div className="flex flex-col gap-2">
                  <Button asChild variant="outline"><a href={churchLinks.webcal}>Apple Calendar / Outlook</a></Button>
                  <Button asChild variant="outline"><a href={churchLinks.google} target="_blank" rel="noreferrer">Google Calendar</a></Button>
                  <Button asChild variant="outline"><a href={churchLinks.outlookWeb} target="_blank" rel="noreferrer">Outlook.com</a></Button>
                  <Button variant="outline" onClick={() => void copy(churchLinks.https, 'Coptic')}><Copy aria-hidden />Copy Coptic calendar link</Button>
                </div>
                <p className="text-xs leading-5 text-ink-3">This public calendar is provided by <a href="https://coptic.io" target="_blank" rel="noreferrer" className="underline">Coptic.io</a>. Updates appear when your calendar app refreshes.</p>
              </section>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-bad">Could not prepare this calendar. Please try again.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
