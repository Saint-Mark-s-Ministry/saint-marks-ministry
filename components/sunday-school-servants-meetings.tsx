'use client'

import { useState } from 'react'
import { Plus, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useSundaySchoolMeetings } from '@/lib/swr'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'
import { formatDateUTC } from '@/lib/utils'

type Mark = 'PRESENT' | 'ABSENT'
interface Meeting { id: string; date: string; title: string | null }
interface MeetingData {
  meetings: Meeting[]
  meeting: Meeting | null
  canEdit: boolean
  canCreate: boolean
  roster: { id: string; name: string; status: Mark | null }[]
}

export function SundaySchoolServantsMeetings({ ageGroupId }: { ageGroupId: string }) {
  const [meetingId, setMeetingId] = useState<string>()
  const { data: response, isLoading, error, mutate } = useSundaySchoolMeetings(ageGroupId, meetingId)
  const data = response as MeetingData | undefined
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState(getSundaySchoolTodayDateInputValue())
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<{ meetingId: string; marks: Record<string, Mark> }>({ meetingId: '', marks: {} })
  const marks = draft.meetingId === meetingId ? draft.marks : {}
  const roster = data?.roster ?? []
  const present = roster.filter(person => (marks[person.id] ?? person.status) === 'PRESENT').length
  const unmarked = roster.filter(person => !(marks[person.id] ?? person.status)).length
  const selectedMeeting = data?.meeting
  const canEdit = Boolean(data?.canEdit && selectedMeeting)

  async function addMeeting() {
    setBusy(true)
    try {
      const res = await fetch('/api/sunday-school/servants-meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ageGroupId, date, title }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not add meeting')
      await mutate()
      setMeetingId(result.id)
      setDraft({ meetingId: '', marks: {} })
      setAdding(false)
      setTitle('')
      toast.success('Meeting ready for attendance')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not add meeting')
    } finally { setBusy(false) }
  }

  async function saveAttendance() {
    if (!selectedMeeting || unmarked > 0) return
    setBusy(true)
    try {
      const res = await fetch('/api/sunday-school/servants-meetings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId: selectedMeeting.id, records: roster.map(person => ({
          servantId: person.id, status: marks[person.id] ?? person.status,
        })) }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Could not save attendance')
      await mutate()
      setDraft({ meetingId: '', marks: {} })
      toast.success('Meeting attendance saved')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save attendance')
    } finally { setBusy(false) }
  }

  return (
    <section className="space-y-4" aria-label="Elementary servants meetings">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Meeting sessions</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">Meeting sessions and attendance for Elementary school servants.</p>
        </div>
        {data?.canCreate && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} disabled={busy}>
            <Plus className="mr-1 h-4 w-4" />Add meeting
          </Button>
        )}
      </div>
      {error ? <p role="alert" className="text-sm text-red-600">Could not load meetings. <button className="underline" onClick={() => mutate()}>Try again</button></p>
        : isLoading ? <p className="text-sm text-gray-500">Loading meetings…</p> : null}
      {adding && (
        <form className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); void addMeeting() }}>
          <div className="space-y-2"><Label htmlFor={`meeting-date-${ageGroupId}`}>Meeting date</Label>
            <Input id={`meeting-date-${ageGroupId}`} type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor={`meeting-title-${ageGroupId}`}>Title (optional)</Label>
            <Input id={`meeting-title-${ageGroupId}`} value={title} maxLength={200} placeholder="e.g. Service planning" onChange={event => setTitle(event.target.value)} disabled={busy} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={busy || !date}>{busy ? 'Adding…' : 'Create session'}</Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button></div>
        </form>
      )}
      {!isLoading && !error && data?.meetings.length === 0 && <p className="text-sm text-gray-500">No meetings have been added yet.</p>}
      {Boolean(data?.meetings.length) && (
        <div className="space-y-2"><Label htmlFor={`meeting-session-${ageGroupId}`}>Meeting session</Label>
          <select id={`meeting-session-${ageGroupId}`} value={meetingId ?? ''} disabled={busy}
            onChange={event => { setMeetingId(event.target.value || undefined); setDraft({ meetingId: '', marks: {} }) }}
            className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="">Choose a meeting</option>
            {data?.meetings.map(meeting => <option key={meeting.id} value={meeting.id}>{formatDateUTC(meeting.date)}{meeting.title ? ` — ${meeting.title}` : ''}</option>)}
          </select>
        </div>
      )}
      {selectedMeeting && !isLoading && !error && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">{present} of {roster.length} present{unmarked > 0 ? ` · ${unmarked} not recorded` : ''}</p>
          {selectedMeeting.date.slice(0, 10) > getSundaySchoolTodayDateInputValue() && <p className="text-sm text-gray-500">Attendance opens on the meeting date.</p>}
          {roster.length === 0 && <p className="text-sm text-gray-500">No active Elementary school servants are assigned yet.</p>}
          <div className="divide-y dark:divide-gray-800">
            {roster.map(person => {
              const mark = marks[person.id] ?? person.status
              return <div key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <p className="font-medium">{person.name}</p>
                {canEdit ? <div className="flex gap-2" role="group" aria-label={`Meeting attendance for ${person.name}`}>
                  {(['PRESENT', 'ABSENT'] as const).map(value => <Button key={value} size="sm" disabled={busy}
                    variant={mark === value ? value === 'ABSENT' ? 'destructive' : 'default' : 'outline'} aria-pressed={mark === value}
                    onClick={() => setDraft({ meetingId: selectedMeeting.id, marks: { ...marks, [person.id]: value } })}>
                    {value === 'PRESENT' ? 'Present' : 'Absent'}
                  </Button>)}
                </div> : <Badge variant={mark === 'PRESENT' ? 'default' : mark === 'ABSENT' ? 'destructive' : 'outline'}>{mark === 'PRESENT' ? 'Present' : mark === 'ABSENT' ? 'Absent' : 'Not recorded'}</Badge>}
              </div>
            })}
          </div>
          {canEdit && roster.length > 0 && <Button onClick={saveAttendance} disabled={busy || unmarked > 0}>
            <Save className="mr-1 h-4 w-4" />{busy ? 'Saving…' : 'Save meeting attendance'}
          </Button>}
          {canEdit && unmarked > 0 && <p className="text-xs text-gray-500">Mark every servant present or absent before saving.</p>}
        </div>
      )}
    </section>
  )
}
