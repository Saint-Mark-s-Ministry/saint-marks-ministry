'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMakeupExamScores } from '@/lib/swr'
import { makeupToday } from '@/lib/makeup-exams'
import { formatDateUTC } from '@/lib/utils'

type Attempt = { id: string; version: number; score: number; totalPoints: number; percentage: number; takenDate: string; notes: string | null }
type Student = { id: string; name: string; originalPercentage: number | null; effectivePercentage: number | null; attempts: Attempt[] }
type Data = { exam: { totalPoints: number; examSection: { passingScore: number } }; students: Student[] }

export function MakeupExamScores({ examId, canEdit, originalUnsaved, onSaved }: { examId: string; canEdit: boolean; originalUnsaved: boolean; onSaved: () => Promise<void> }) {
  const { data: rawData, error, isLoading, mutate } = useMakeupExamScores(examId)
  const data = rawData as Data | undefined
  const [studentId, setStudentId] = useState('')
  const [version, setVersion] = useState('')
  const [score, setScore] = useState('')
  const [totalPoints, setTotalPoints] = useState('')
  const [date, setDate] = useState(makeupToday())
  const [notes, setNotes] = useState('')
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const points = totalPoints || String(data?.exam.totalPoints ?? 100)
  const candidates = data?.students.filter(student => student.effectivePercentage === null || student.effectivePercentage < data.exam.examSection.passingScore || (attemptId && student.id === studentId)) ?? []

  function reset() { setStudentId(''); setVersion(''); setScore(''); setTotalPoints(''); setDate(makeupToday()); setNotes(''); setAttemptId(null) }
  function edit(student: Student, attempt: Attempt) {
    setStudentId(student.id); setVersion(String(attempt.version)); setScore(String(attempt.score)); setTotalPoints(String(attempt.totalPoints)); setDate(attempt.takenDate.slice(0, 10)); setNotes(attempt.notes ?? ''); setAttemptId(attempt.id)
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true)
    try {
      const response = await fetch(`/api/exams/${examId}/makeup-scores`, { method: attemptId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId, version: Number(version), score: Number(score), totalPoints: Number(points), takenDate: date, notes, ...(attemptId ? { attemptId } : {}) }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save makeup score.')
      await mutate(); await onSaved(); reset(); toast.success('Makeup exam score saved.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to save makeup score.') }
    finally { setSaving(false) }
  }

  return <Panel title="Makeup exam scores" description="Record each retake separately. The highest percentage from the original exam and all makeup attempts counts toward progress and graduation." bodyClassName="space-y-5 p-4">
    {isLoading && <p role="status">Loading makeup scores…</p>}
    {error && <div role="alert">Unable to load makeup scores. <Button variant="outline" onClick={() => mutate()}>Try again</Button></div>}
    {data && canEdit && <form onSubmit={save} className="space-y-4">
      {originalUnsaved && <p className="text-sm text-warn">Save your original exam score changes before recording a makeup score.</p>}
      {candidates.length ? <>
        <fieldset disabled={saving || originalUnsaved} className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label htmlFor="makeup-score-student">Student</Label><select id="makeup-score-student" required value={studentId} onChange={event => setStudentId(event.target.value)} disabled={!!attemptId} className="w-full rounded-md border border-line-strong bg-surface p-2 text-base text-ink md:text-sm"><option value="">Choose a student</option>{candidates.map(student => <option key={student.id} value={student.id}>{student.name} — {student.effectivePercentage === null ? 'Missed' : `${student.effectivePercentage.toFixed(1)}%`}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="makeup-score-version">Makeup exam version</Label><select id="makeup-score-version" required value={version} onChange={event => setVersion(event.target.value)} className="w-full rounded-md border border-line-strong bg-surface p-2 text-base text-ink md:text-sm"><option value="">Choose a version</option><option value="1">Version 1</option><option value="2">Version 2</option></select></div>
          <div className="space-y-2"><Label htmlFor="makeup-score-date">Date taken</Label><Input id="makeup-score-date" type="date" required max={makeupToday()} value={date} onChange={event => setDate(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="makeup-score-points">Total points</Label><Input id="makeup-score-points" type="number" required min="1" step="1" value={points} onChange={event => setTotalPoints(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="makeup-score-result">Makeup score</Label><Input id="makeup-score-result" type="number" required min="0" max={points} step="any" value={score} onChange={event => setScore(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="makeup-score-notes">Notes (optional)</Label><Textarea id="makeup-score-notes" value={notes} onChange={event => setNotes(event.target.value)} /></div>
        </fieldset>
        <div className="flex gap-2"><Button type="submit" disabled={saving || originalUnsaved || !studentId || !version || score === ''}>{saving ? 'Saving…' : attemptId ? 'Update makeup score' : 'Save makeup score'}</Button>{attemptId && <Button type="button" variant="outline" onClick={reset} disabled={saving}>Cancel edit</Button>}</div>
      </> : <p className="text-sm text-ink-3">No failed or missed exams need a makeup score.</p>}
    </form>}
    {data && <div className="space-y-3">
      {data.students.filter(student => student.attempts.length).map(student => <div key={student.id} className="rounded-md border border-line p-3">
        <p className="font-medium">{student.name}</p><p className="text-sm text-ink-3">Original: {student.originalPercentage === null ? 'Not taken' : `${student.originalPercentage.toFixed(1)}%`} · Counts toward progress: {student.effectivePercentage?.toFixed(1)}%</p>
        <ul className="mt-2 divide-y divide-line">{student.attempts.map(attempt => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><div>Version {attempt.version} · {attempt.score}/{attempt.totalPoints} ({attempt.percentage.toFixed(1)}%) · {formatDateUTC(attempt.takenDate)}{attempt.notes && <p className="text-ink-3">{attempt.notes}</p>}</div>{canEdit && <Button type="button" variant="outline" size="sm" disabled={saving || originalUnsaved} onClick={() => edit(student, attempt)}>Edit</Button>}</li>)}</ul>
      </div>)}
      {!data.students.some(student => student.attempts.length) && <p className="text-sm text-ink-3">No makeup exam scores recorded yet.</p>}
    </div>}
  </Panel>
}
