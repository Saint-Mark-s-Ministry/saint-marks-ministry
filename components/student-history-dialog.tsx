'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ds/status-badge'
import { useStudentHistory, useStudentHistoryPrivateNotes } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { getAttendanceStatusLabel } from '@/lib/attendance-utils'
import type { StudentHistory, StudentHistoryTarget } from '@/lib/student-history'
import type { SundaySchoolPhoneCallOutcome } from '@prisma/client'

const callLabels: Record<SundaySchoolPhoneCallOutcome, string> = {
  CONNECTED: 'Connected', NO_ANSWER: 'No answer', LEFT_VOICEMAIL: 'Left voicemail', OTHER: 'Other',
}

export default function StudentHistoryDialog({ target, onClose, onRestoreFocus }: {
  target: StudentHistoryTarget
  onClose: () => void
  onRestoreFocus: () => void
}) {
  const { data: session } = useSession()
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" onCloseAutoFocus={event => { event.preventDefault(); onRestoreFocus() }}>
      <DialogHeader>
        <DialogTitle>{target.name}</DialogTitle>
        <DialogDescription>{target.program === 'prep' ? 'Servants Prep' : 'Sunday School'} student history</DialogDescription>
      </DialogHeader>
      {session?.user?.id && <HistoryContent key={session.user.id} target={target} viewerId={session.user.id} />}
    </DialogContent>
  </Dialog>
}

function HistoryContent({ target, viewerId }: { target: StudentHistoryTarget; viewerId: string }) {
  const [tab, setTab] = useState('attendance')
  const { data, error, isLoading, isValidating, mutate } = useStudentHistory(target, viewerId)
  // SWR may retain data after a denied revalidation. Never render it on error.
  if (error) {
    const status = (error as { status?: number }).status
    return <div role="alert" className="space-y-3 py-4">
      <p>{status === 403 ? 'You do not have access to this student’s history.' : status === 404 ? 'This student’s record is no longer available.' : 'Couldn’t load student history.'}</p>
      <Button variant="outline" onClick={() => void mutate()}>Retry</Button>
    </div>
  }
  if (isLoading || isValidating || !data) return <p role="status" className="py-4 text-sm text-ink-3">Loading student history…</p>
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-ink-3">{data.subtitle}</p>
      {target.program === 'sunday-school' && data.isServantsPrepStudent && (
        <StatusBadge tone="accent" dot={false}>Servants Prep Student</StatusBadge>
      )}
    </div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="attendance">Attendance</TabsTrigger>
        <TabsTrigger value="notes">Notes</TabsTrigger>
        <TabsTrigger value="visitations">Visitations</TabsTrigger>
      </TabsList>
      <TabsContent value="attendance"><AttendanceHistory attendance={data.attendance} /></TabsContent>
      <TabsContent value="notes" className="space-y-4">
        {data.notes.general && <section className="rounded-lg border border-line p-4"><h3 className="mb-2 text-sm font-semibold">General notes</h3><p className="whitespace-pre-wrap break-words text-sm">{data.notes.general}</p></section>}
        {!data.notes.general && data.notes.entries.length === 0 && <Empty>No notes recorded yet.</Empty>}
        <ul className="space-y-3">{data.notes.entries.map(note => <li key={note.id} className="rounded-lg border border-line p-4">
          <p className="mb-2 text-xs text-ink-3">{note.author.name} · {formatDateUTC(note.createdAt)}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{note.content}</p>
        </li>)}</ul>
        {target.program === 'sunday-school' && data.canReadPrivateNotes && <PrivateNotes childId={target.id} viewerId={viewerId} />}
      </TabsContent>
      <TabsContent value="visitations" className="space-y-4">
        {data.visitations === null ? <Empty>Visitations are recorded for Sunday School children. Servants Prep has no visitation records.</Empty> : <>
          <h3 className="text-sm font-semibold">Visitation history</h3>
          {data.visitations.length === 0 && <Empty>No visitations recorded yet.</Empty>}
          <ul className="space-y-3">{data.visitations.map(visit => <li key={visit.id} className="rounded-lg border border-line p-4 text-sm">
            <p className="font-medium">{visit.status === 'DONE' ? 'Visited' : 'Not done'} · {formatDateUTC(visit.visitedAt ?? visit.createdAt)}</p>
            {visit.recorder && <p className="mt-1 text-xs text-ink-3">Recorded by {visit.recorder.name}</p>}
            {visit.notes && <p className="mt-2 whitespace-pre-wrap break-words">{visit.notes}</p>}
          </li>)}</ul>
          <h3 className="text-sm font-semibold">Phone calls</h3>
          {data.phoneCalls.length === 0 && <Empty>No phone calls recorded yet.</Empty>}
          <ul className="space-y-3">{data.phoneCalls.map(call => <li key={call.id} className="rounded-lg border border-line p-4 text-sm">
            <p className="font-medium">{callLabels[call.outcome]} · {formatDateUTC(call.calledAt)}</p>
            <p className="mt-1 text-xs text-ink-3">{call.callerName}</p>
            <p className="mt-2 whitespace-pre-wrap break-words">{call.note}</p>
          </li>)}</ul>
        </>}
      </TabsContent>
    </Tabs>
  </div>
}

function AttendanceHistory({ attendance }: { attendance: StudentHistory['attendance'] }) {
  return <div className="space-y-4">
    <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line p-4 sm:grid-cols-5">
      {[{ label: 'Rate', value: attendance.rate === null ? '—' : `${Math.round(attendance.rate)}%` },
        ...Object.entries(attendance.counts).map(([label, value]) => ({ label, value }))].map(stat => <div key={stat.label}>
        <dt className="text-xs capitalize text-ink-3">{stat.label}</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
      </div>)}
    </dl>
    <p className="text-sm text-ink-3">{attendance.kind === 'rotations'
      ? 'Attendance comes from elapsed serving rotation weeks. Future weeks do not count; an elapsed week without a verified or excused log counts absent.'
      : attendance.kind === 'meetings' ? 'Saved marks in classes you can access. Late counts half; excused and unrecorded meetings are excluded.'
        : 'Late counts half. Excused, N/A, exam-day, and cancelled lessons are excluded from the rate.'}</p>
    {attendance.records.length === 0 ? <Empty>No attendance recorded yet.</Empty> : <ul className="divide-y divide-line">
      {attendance.records.map(record => <li key={record.id} className="py-3 text-sm">
        <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{formatDateUTC(record.date)}</p><p className="text-xs text-ink-3">{record.title}</p></div>
          <span className="shrink-0">{record.notApplicable ? 'N/A' : getAttendanceStatusLabel(record.status)}{record.excluded && <span className="block text-right text-xs text-ink-3">Exam day · excluded</span>}</span>
        </div>
        {record.notes && <p className="mt-2 whitespace-pre-wrap break-words text-ink-2">{record.notes}</p>}
      </li>)}
    </ul>}
  </div>
}

function PrivateNotes({ childId, viewerId }: { childId: string; viewerId: string }) {
  const { data, error, isLoading, isValidating, mutate } = useStudentHistoryPrivateNotes(childId, viewerId)
  if (error) return <div role="alert" className="space-y-2 text-sm"><p>Couldn’t load confidential notes.</p><Button variant="outline" onClick={() => void mutate()}>Retry</Button></div>
  if (isLoading || isValidating) return <p role="status" className="text-sm text-ink-3">Loading confidential notes…</p>
  if (!data?.notes.length) return null
  return <section className="space-y-3"><h3 className="text-sm font-semibold">Confidential notes</h3>
    <p className="text-xs text-ink-3">Visible only to the author and priests. Super Admins and View as sessions cannot read these notes.</p>
    <ul className="space-y-3">{data.notes.map(note => <li key={note.id} className="rounded-lg border border-line p-4 text-sm">
      <p className="mb-2 text-xs text-ink-3">{note.author.name} · {formatDateUTC(note.createdAt)}</p><p className="whitespace-pre-wrap break-words">{note.content}</p>
    </li>)}</ul>
  </section>
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-sm text-ink-3">{children}</p>
}
