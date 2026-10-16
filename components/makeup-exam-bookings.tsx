'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useMakeupExams } from '@/lib/swr'
import { formatDateUTC } from '@/lib/utils'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Exam = { id: string; examDate: string; yearLevel: string; examSection: { displayName: string }; academicYear: { name: string } }
type Booking = { id: string; scheduledDate: string; exam: Exam; student?: { name: string; email: string } }
type EligibleExam = Exam & { reason: 'FAILED' | 'MISSED'; currentPercentage: number | null; examSection: { displayName: string; passingScore: number } }
type Data = { exams: EligibleExam[]; bookings: Booking[]; fridays: string[] }
const examLabel = (exam: Exam) => `${exam.examSection.displayName} — ${exam.yearLevel === 'BOTH' ? 'Both years' : exam.yearLevel === 'YEAR_1' ? 'Year 1' : 'Year 2'} — ${exam.academicYear.name} (${formatDateUTC(exam.examDate)})`

export function MakeupExamBookings({ staff = false, enabled = true }: { staff?: boolean; enabled?: boolean }) {
  const { data: rawData, error, isLoading, mutate } = useMakeupExams(enabled)
  const data = rawData as Data | undefined
  const [examId, setExamId] = useState('')
  const [friday, setFriday] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(method: 'POST' | 'DELETE', body: object) {
    setSaving(true)
    try {
      const res = await fetch('/api/makeup-exams', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Unable to save your booking.')
      await mutate()
      toast.success(method === 'POST' ? 'Your makeup exam is scheduled.' : 'Booking cancelled.')
      setExamId(''); setFriday('')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save your booking.') }
    finally { setSaving(false) }
  }

  return <Panel
    title={staff ? 'Makeup exam bookings' : 'Schedule a makeup exam'}
    description={staff ? 'Student bookings, ordered by Friday.' : 'Choose a Friday and an exam you failed or missed. Your booking is confirmed when you save.'}
    bodyClassName="space-y-6 p-4"
  >
      {isLoading && <p role="status">Loading makeup exams…</p>}
      {error && <div role="alert"><p>Unable to load makeup exams.</p><Button variant="outline" onClick={() => mutate()}>Try again</Button></div>}
      {data && !staff && (data.exams.length ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); void submit('POST', { examId, scheduledDate: friday }) }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="makeup-friday">Choose a Friday</Label>
            <select id="makeup-friday" className="w-full rounded-md border-line-strong bg-surface p-2 text-base text-ink md:text-sm" required value={friday} disabled={saving} onChange={event => setFriday(event.target.value)}>
              <option value="">Select a Friday</option>{data.fridays.map(date => <option key={date} value={date}>{formatDateUTC(`${date}T00:00:00Z`)}</option>)}
            </select>
          </div>
          <div className="space-y-2"><Label htmlFor="makeup-exam">Choose an exam</Label>
            <select id="makeup-exam" className="w-full rounded-md border-line-strong bg-surface p-2 text-base text-ink md:text-sm" required value={examId} disabled={saving} onChange={event => setExamId(event.target.value)}>
              <option value="">Select an exam</option>
              {(['FAILED', 'MISSED'] as const).map(reason => {
                const exams = data.exams.filter(exam => exam.reason === reason)
                return exams.length ? <optgroup key={reason} label={reason === 'FAILED' ? 'Failed exams' : 'Missed exams'}>
                  {exams.map(exam => <option key={exam.id} value={exam.id}>{examLabel(exam)}{exam.reason === 'FAILED' ? ` — ${exam.currentPercentage}% (passing: ${exam.examSection.passingScore}%)` : ' — Not taken'}</option>)}
                </optgroup> : null
              })}
            </select>
          </div>
        </div>
        <p className="text-sm text-ink-3">To reschedule, select the same exam and a new Friday. Available dates cover the next 12 weeks.</p>
        <Button type="submit" disabled={saving || !friday || !examId}>{saving ? 'Saving…' : 'Schedule makeup exam'}</Button>
      </form> : <p className="text-sm text-ink-3">You have no failed or missed exams available to schedule.</p>)}
      {data && <div className="space-y-3">
        {!staff && <h2 className="font-medium">Your bookings</h2>}
        {!data.bookings.length && <p className="text-sm text-ink-3">No makeup exams scheduled.</p>}
        {data.bookings.map(booking => <div key={booking.id} className="flex flex-col gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">Friday, {formatDateUTC(booking.scheduledDate)}</p>
            <p className="text-sm">{examLabel(booking.exam)}</p>
            {staff && booking.student && <p className="text-sm text-ink-3">{booking.student.name} · {booking.student.email}</p>}
          </div>
          {!staff && data.fridays.includes(booking.scheduledDate.slice(0, 10)) && <Button variant="outline" disabled={saving} onClick={() => submit('DELETE', { id: booking.id })}>Cancel booking</Button>}
        </div>)}
      </div>}
  </Panel>
}
