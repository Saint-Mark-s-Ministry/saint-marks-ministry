'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolMeetingHistory, useSundaySchoolMeetingHistoryDetail } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'

export default function MeetingHistoryPage() {
  const { session, status, hasAccess } = useSundaySchoolGuard()
  const [cursors, setCursors] = useState<string[]>([])
  const [meetingId, setMeetingId] = useState<string>()
  const viewerId = status === 'authenticated' && hasAccess ? session?.user?.id : undefined
  const list = useSundaySchoolMeetingHistory(viewerId, cursors.at(-1))
  const detail = useSundaySchoolMeetingHistoryDetail(viewerId, meetingId)
  const meeting = detail.data
  const nextCursor = list.data?.nextCursor

  if (status !== 'authenticated' || !hasAccess) return <PageLoading />

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Meeting attendance history"
        meta="Recorded servants meetings across all school groups and academic years"
        back={{ href: '/dashboard/servants/servant-attendance/meetings', label: 'Servants meetings' }} />
      <Panel bodyClassName="space-y-4 p-4">
        {list.error ? (
          <div role="alert">
            <p>Could not load attendance history. Access is restricted to priests and super admins.</p>
            <Button className="mt-2" variant="outline" onClick={() => list.mutate()}>Try again</Button>
          </div>
        ) : list.isLoading ? <p role="status">Loading meeting history…</p> : (
          <>
            {list.data?.meetings.length ? (
              <div className="space-y-2">
                <Label htmlFor="history-meeting">Recorded meeting</Label>
                <select id="history-meeting" value={meetingId ?? ''} onChange={event => setMeetingId(event.target.value || undefined)}
                  className="h-11 w-full rounded-md border border-line bg-surface px-3 text-sm">
                  <option value="">Choose a meeting</option>
                  {list.data.meetings.map(item => <option key={item.id} value={item.id}>
                    {formatDateUTC(item.date)} — {item.ageGroupName} — {item.academicYearName}{item.title ? ` — ${item.title}` : ''}
                  </option>)}
                </select>
              </div>
            ) : <EmptyState message="No recorded meeting attendance is available." />}
            <div className="flex flex-wrap gap-2">
              {cursors.length > 0 && <Button variant="outline" onClick={() => {
                setCursors(previous => previous.slice(0, -1)); setMeetingId(undefined)
              }}>Newer meetings</Button>}
              {nextCursor && <Button variant="outline" onClick={() => {
                setCursors(previous => [...previous, nextCursor]); setMeetingId(undefined)
              }}>Older meetings</Button>}
            </div>
            {meetingId && (detail.error ? (
              <div role="alert"><p>Could not load this meeting’s attendance.</p>
                <Button variant="outline" onClick={() => detail.mutate()}>Retry meeting</Button></div>
            ) : detail.isLoading ? <p role="status">Loading attendance…</p> : meeting ? (
              <section className="space-y-3" aria-label="Recorded attendance">
                <h2 className="font-semibold">{formatDateUTC(meeting.date)} — {meeting.ageGroupName}</h2>
                <p className="text-sm text-ink-2">{meeting.academicYearName}{meeting.title ? ` · ${meeting.title}` : ''}</p>
                <p className="text-sm">{meeting.presentCount} present · {meeting.absentCount} absent · {meeting.recordedCount} recorded</p>
                <p className="text-xs text-ink-3">Saved attendance only. Unrecorded attendance is not counted as absent.</p>
                <ul className="divide-y divide-line">
                  {meeting.attendance.map(person => <li key={person.id} className="flex items-center justify-between gap-3 py-3">
                    <span>{person.name}</span>
                    <Badge variant={person.status === 'PRESENT' ? 'default' : 'destructive'}>{person.status === 'PRESENT' ? 'Present' : 'Absent'}</Badge>
                  </li>)}
                </ul>
              </section>
            ) : null)}
          </>
        )}
      </Panel>
    </div>
  )
}
