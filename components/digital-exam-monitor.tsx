'use client'
import { useEffect, useRef, useState } from 'react'
import Pusher from 'pusher-js'
import { toast } from 'sonner'
import { useDigitalExam } from '@/lib/swr'
import { ExamActivityDetail } from '@/components/exam-activity-detail'
import { examActivityMessage, latestPauseActivity, PAUSE_ALERT_KINDS } from '@/lib/exam-activity-messages'
import type { ExamActivity, DigitalExamView } from '@/lib/digital-exam-types'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ANSWER_CHOICES } from '@/lib/digital-exams'
import { formatDateUTC } from '@/lib/utils'

function Configuration({ view, save, busy }: { view: DigitalExamView; save: (counts: number[], key: string[]) => void; busy: boolean }) {
  const [counts, setCounts] = useState(view.sheet?.choiceCounts ?? Array(50).fill(4))
  const [key, setKey] = useState(view.answerKey ?? Array(50).fill(''))
  return <Panel title="Set up the original exam" description="Printed questions · 50 equally weighted answers · Makeup exams stay on paper" bodyClassName="p-4">
    <p className="mb-4 text-sm text-ink-3">Enter every correct answer before opening. The answer key and choices lock when the exam first opens.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{key.map((answer, i) => <div key={i} className="flex items-center gap-2"><span className="w-6 text-sm tabular-nums">{i + 1}.</span><select aria-label={`Question ${i + 1} choices`} value={counts[i]} onChange={e => { const next = [...counts]; next[i] = Number(e.target.value); setCounts(next); if (key[i] && key[i].charCodeAt(0) - 65 >= next[i]) { const answers = [...key]; answers[i] = ''; setKey(answers) } }} className="rounded-md border border-line bg-surface p-2 text-sm">{[2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>A–{ANSWER_CHOICES[n - 1]}</option>)}</select><select aria-label={`Question ${i + 1} correct answer`} value={answer} onChange={e => { const next = [...key]; next[i] = e.target.value; setKey(next) }} className="rounded-md border border-line bg-surface p-2 text-sm"><option value="">Key</option>{ANSWER_CHOICES.slice(0, counts[i]).split('').map(a => <option key={a}>{a}</option>)}</select></div>)}</div>
    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-ink-3">{key.filter(Boolean).length}/50 key answers entered</p><Button disabled={busy || key.some(a => !a)} onClick={() => save(counts, key)}>Save answer sheet setup</Button></div>
  </Panel>
}
export function DigitalExamMonitor({ examId }: { examId: string }) {
  const { data, error, mutate } = useDigitalExam(examId)
  const [busy, setBusy] = useState(false)
  const [sound, setSound] = useState(false)
  const [live, setLive] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'release' | 'reset' | 'ready' | null>(null)
  const [retake, setRetake] = useState<{ id: string; name: string } | null>(null)
  const [alerts, setAlerts] = useState<{ event: ExamActivity; name: string; studentId: string }[]>([])
  const seen = useRef<Set<string> | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const hasSheet = !!data?.sheet
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY; const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER
    if (!key || !cluster || !data?.realtimeConfigured || !hasSheet) return
    const client = new Pusher(key, { cluster, channelAuthorization: { endpoint: '/api/digital-exams/live-auth', transport: 'ajax' } })
    const channel = client.subscribe(`private-digital-exam-${examId}`)
    channel.bind('changed', () => void mutate())
    channel.bind('pusher:subscription_succeeded', () => setLive(true))
    channel.bind('pusher:subscription_error', () => setLive(false))
    client.connection.bind('state_change', ({ current }: { current: string }) => { if (current !== 'connected') setLive(false) })
    return () => { channel.unbind_all(); client.disconnect(); setLive(false) }
  }, [examId, data?.realtimeConfigured, hasSheet, mutate])
  useEffect(() => {
    if (!data?.roster) return
    const allEvents = data.roster.flatMap(row => row.attempt?.events.map(event => ({ ...event, name: row.student.name, studentId: row.student.id })) ?? [])
    if (!seen.current) { seen.current = new Set(allEvents.map(e => e.id)); return }
    const fresh = allEvents.filter(e => !seen.current!.has(e.id))
    for (const event of fresh) {
      seen.current.add(event.id)
      if (!PAUSE_ALERT_KINDS.has(event.kind)) continue
      const message = examActivityMessage(event.kind, event)
      setAlerts(previous => [{ event, name: event.name, studentId: event.studentId }, ...previous].slice(0, 8))
      toast.warning(`${event.name}: ${message.title}`)
      if (sound && audio.current?.paused) {
        audio.current.currentTime = 0
        void audio.current.play().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setSound(false)
          toast.error('Could not play the alert. Enable donkey sound again to retry.')
        })
      }
    }
  }, [data?.roster, sound])
  useEffect(() => () => { audio.current?.pause() }, [])
  function toggleSound() {
    if (sound) { audio.current?.pause(); if (audio.current) audio.current.currentTime = 0; setSound(false); return }
    audio.current ??= new Audio('/sounds/donkey-bray.mp3')
    audio.current.preload = 'auto'
    audio.current.volume = 0.5
    audio.current.currentTime = 0
    setSound(true)
    // Preview within the user gesture also enables subsequent browser playback.
    void audio.current.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setSound(false)
      toast.error('Could not play the alert. Enable donkey sound again to retry.')
    })
  }
  async function action(name: string, payload: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const response = await fetch(`/api/digital-exams/${examId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update the exam.')
      toast.success(name === 'ready' ? 'Exam ready to open; grades and history preserved' : name === 'retake' ? 'Individual retake approved; previous grade and history preserved' : name === 'reset' ? 'Test opening reset; answer key and grades preserved' : name === 'configure' ? 'Answer sheet setup saved' : name === 'unlock' ? 'Student unlocked' : name === 'release' ? 'Results released' : name === 'open' ? 'Exam opened' : 'Exam closed and saved answers submitted')
      await mutate()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update the exam.') }
    finally { setBusy(false); setConfirm(null); setRetake(null) }
  }
  if (error) return <Panel title="Monitoring unavailable" bodyClassName="p-4"><p role="alert">Could not refresh student status. Treat previous status as out of date. Saved answers and pauses remain on the server.</p><Button variant="outline" className="mt-3" onClick={() => void mutate()}>Retry monitoring</Button></Panel>
  if (!data) return <p>Loading exam monitoring…</p>
  const manage = data.canManage
  const sheet = data.sheet
  const roster = data.roster ?? []
  const started = roster.filter(r => r.attempt && !r.attempt.retakeReady).length
  const paused = roster.filter(r => r.attempt?.state === 'PAUSED' && !r.attempt.retakeReady).length
  const submitted = roster.filter(r => r.attempt?.state === 'SUBMITTED').length
  const savedAnswers = roster.flatMap(row => row.attempt?.events.filter(event => event.kind === 'ANSWER_SAVED').map(event => ({ event, name: row.student.name })) ?? []).sort((a, b) => b.event.createdAt.localeCompare(a.event.createdAt) || b.event.id.localeCompare(a.event.id)).slice(0, 8)
  return <div className="flex flex-col gap-5">
    <PageHeader title={data.exam.examSection.displayName} meta={['Original exam monitoring', formatDateUTC(data.exam.examDate), sheet?.state === 'DRAFT' && sheet.openedAt ? 'Ready to open' : sheet?.state ?? 'Not configured']} back={{ href: '/dashboard/admin/exam-monitoring', label: 'Exam Monitoring' }} actions={manage && sheet && <>{sheet.openedAt && sheet.state !== 'DRAFT' && <Button variant="outline" disabled={busy} onClick={() => setConfirm('ready')}>Set ready to open</Button>}{sheet.state !== 'OPEN' && (!sheet.releasedAt || roster.some(r => r.attempt && r.attempt.state !== 'SUBMITTED')) && <Button disabled={busy} onClick={() => void action('open')}>Open exam</Button>}{sheet.state === 'OPEN' && <Button variant="outline" disabled={busy} onClick={() => setConfirm('close')}>Close exam</Button>}{sheet.state === 'CLOSED' && (!sheet.releasedAt || !!data.pendingResults) && <Button disabled={busy} onClick={() => setConfirm('release')}>Release results</Button>}</>} />
    {manage && !sheet?.openedAt && <Configuration key={`${sheet?.choiceCounts.join('')}:${data.answerKey?.join('')}`} view={data} busy={busy} save={(choiceCounts, answerKey) => void action('configure', { choiceCounts, answerKey })} />}
    {manage && sheet?.openedAt && !sheet.releasedAt && !data.hasAttempts && <Panel title="Opened only for testing?" bodyClassName="p-4"><p className="mb-3 text-sm">Nobody has joined. Reset the test opening to hide the answer sheet from students and return it to draft. The answer key and all existing grades are preserved.</p><Button variant="outline" disabled={busy} onClick={() => setConfirm('reset')}>Reset test opening</Button></Panel>}
    {!manage && !sheet && <Panel bodyClassName="p-4">An exam leader has not configured an answer sheet yet.</Panel>}
    {sheet && <>
      <Panel title="Live monitoring" description="Activity flags support proctor review; they do not establish cheating." actions={<Button variant="outline" size="sm" onClick={toggleSound}>{sound ? 'Mute donkey sound' : 'Enable donkey sound'}</Button>} bodyClassName="p-4">
        <div className="flex flex-wrap gap-5 text-sm"><span>{started}/{roster.filter(r => r.eligible).length} started</span><span>{paused} paused</span><span>{submitted} submitted</span><span className={live ? 'text-ok' : 'text-ink-3'}>{live ? 'Live alerts connected · Refresh backup active' : 'Monitoring refreshes every 2 seconds'}</span></div>
        {sheet.releasedAt && <p className="mt-3 text-sm text-ok">Results released {new Date(sheet.releasedAt).toLocaleString()}</p>}
        {alerts.length > 0 && <div role="log" aria-live="polite" className="mt-4 rounded-md border border-warn/30 bg-warn/10 p-3"><div className="mb-2 flex justify-between"><strong className="text-sm">Recent alerts</strong><button className="text-xs underline" onClick={() => setAlerts([])}>Dismiss</button></div>{alerts.map(alert => {
          const current = roster.find(row => row.student.id === alert.studentId)?.attempt
          return <div key={alert.event.id} className="mt-3 border-t border-warn/20 pt-3"><p className="mb-2 text-sm font-semibold">{alert.name} · Current status: {current?.state === 'PAUSED' ? 'Paused — proctor clearance required' : current?.state === 'SUBMITTED' ? 'Submitted — answers final' : current?.state === 'ACTIVE' ? 'Answering' : 'Not on the current roster'}</p><ExamActivityDetail event={alert.event} /></div>
        })}</div>}
      </Panel>
      <Panel title="Recent saved answers" description="Student choices confirmed by saved answers.">
        {savedAnswers.length === 0 ? <p className="p-4 text-sm text-ink-3">No answer changes have been saved yet.</p> : <ul className="divide-y divide-line">{savedAnswers.map(({ event, name }) => <li key={event.id} className="p-4"><p className="mb-2 text-sm font-semibold">{name}</p><ExamActivityDetail event={event} /></li>)}</ul>}
      </Panel>
      <Panel title="Students" description="A stale connection means no contact for more than 30 seconds. Students must return and reconnect before unlocking.">
        {roster.length === 0 && <p className="p-4 text-sm text-ink-3">No eligible students.</p>}
        <ul className="divide-y divide-line">{roster.map(row => {
          const attempt = row.attempt
          return <li key={row.student.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{row.student.name}{!row.eligible && <span className="ml-2 text-xs text-ink-3">Historical attempt</span>}</p><p className="mt-1 text-sm text-ink-3">{attempt?.retakeReady ? 'Retake approved · Not started' : attempt ? `${attempt.state === 'SUBMITTED' ? 'Submitted' : attempt.state === 'PAUSED' ? 'Paused' : 'Answering'} · ${attempt.answeredCount}/50 answered${attempt.state !== 'SUBMITTED' && attempt.stale ? ' · Connection stale' : ''}` : 'Not started'}</p>{attempt && <p className="mt-1 text-xs text-ink-3">Last contact: {new Date(attempt.lastSeenAt).toLocaleTimeString()}{attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleTimeString()} · ${attempt.correctCount}/50` : ''}</p>}</div>{manage && !attempt?.retakeReady && attempt?.state === 'PAUSED' && <Button size="sm" variant="outline" disabled={busy || attempt.stale || attempt.pageVisible === false || sheet.state !== 'OPEN'} onClick={() => void action('unlock', { attemptId: attempt.id })}>Unlock student</Button>}</div>
            {!attempt?.retakeReady && attempt?.state === 'PAUSED' && <div className="mt-3 rounded-md border border-warn/30 bg-warn/10 p-3"><p className="text-sm font-semibold">Answering paused — proctor clearance required</p>{(() => {
              const event = latestPauseActivity(attempt.events)
              return event ? <div className="mt-2"><ExamActivityDetail event={event} /></div> : <p className="mt-1 text-sm">Review the interruption before unlocking.</p>
            })()}<p className="mt-2 text-sm font-medium">{sheet.state !== 'OPEN' ? 'Exam closed.' : attempt.stale ? 'Waiting for contact: student must reconnect.' : attempt.pageVisible === false ? 'Waiting for return: exam page is hidden.' : 'Student connected. Review before unlocking.'}</p>{!manage && <p className="mt-1 text-sm">An exam leader must unlock. Your monitoring access is read-only.</p>}</div>}
            {!attempt?.retakeReady && attempt?.state !== 'SUBMITTED' && attempt?.stale && <p className="mt-2 text-sm text-warn">No contact for more than 30 seconds.</p>}
            {attempt && <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-3">Activity history ({attempt.events.length})</summary><ol className="mt-2 space-y-1 border-l border-line pl-3">{attempt.events.map(event => <li key={event.id} className="border-b border-line py-2 last:border-0"><ExamActivityDetail event={event} /></li>)}</ol></details>}
          </li>
        })}</ul>
      </Panel>
    </>}
    {manage && sheet?.openedAt && !!data.retakeCandidates?.length && <Panel title="Individual retakes" description="Approve a new original exam attempt for one student. Existing grades and previous attempts are preserved; only a higher score is published when results are released." bodyClassName="p-4"><ul className="space-y-3">{data.retakeCandidates.map(student => <li key={student.id} className="flex items-center justify-between gap-3"><span>{student.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={() => setRetake(student)}>Allow retake</Button></li>)}</ul></Panel>}
    <Dialog open={!!retake} onOpenChange={open => { if (!open) setRetake(null) }}><DialogContent><DialogHeader><DialogTitle>Allow {retake?.name} to retake this exam?</DialogTitle><DialogDescription>The previous answers, activity history, and grade will be preserved. A new blank answer sheet will be available to this student while the exam is open. Close the exam and release results to publish a higher score. A lower score never reduces the existing grade. Paper makeup exams are unchanged.</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRetake(null)}>Cancel</Button><Button disabled={busy} onClick={() => retake && void action('retake', { studentId: retake.id })}>Allow retake</Button></div></DialogContent></Dialog>
    {!!data.completedHistory?.length && <Panel title="Past digital activity" bodyClassName="p-4"><details><summary className="cursor-pointer text-sm text-ink-3">View preserved activity history ({data.completedHistory.length} graded attempts)</summary><div className="mt-3 space-y-4">{data.completedHistory.map(row => <div key={`${row.student.id}:${row.attemptNumber}`}><p className="text-sm font-medium">{row.student.name} · Attempt {row.attemptNumber ?? 1}</p><details className="mt-2 text-sm"><summary className="cursor-pointer">Preserved answers and grade</summary>{typeof row.snapshot?.correctCount === 'number' && <p className="mt-2">Attempt result: {row.snapshot.correctCount}/50 ({row.snapshot.correctCount * 2}%)</p>}<div className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-10">{row.snapshot?.answers?.map((answer, question) => <span key={question} className="rounded border border-line p-2 text-center text-xs">{question + 1}: {answer || 'Blank'}</span>)}</div></details><ol className="mt-2 space-y-1 border-l border-line pl-3">{row.events.map(event => <li key={event.id} className="border-b border-line py-2 last:border-0"><ExamActivityDetail event={event} /></li>)}</ol></div>)}</div></details></Panel>}
    <Dialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null) }}><DialogContent><DialogHeader><DialogTitle>{confirm === 'ready' ? 'Set this exam ready to open?' : confirm === 'reset' ? 'Reset this test opening?' : confirm === 'close' ? 'Close and finalize this exam?' : 'Release exam results?'}</DialogTitle><DialogDescription>{confirm === 'ready' ? 'The answer sheet will be hidden until you open the exam again. Locked choices, the answer key, grades, submissions and retake approvals are preserved. Close started attempts first. A submitted student can answer again only with individual retake approval.' : confirm === 'reset' ? 'This returns the answer sheet to draft and hides it from students. The answer key and all saved grades are preserved. Reset is blocked if any student has joined.' : confirm === 'close' ? 'All started attempts will be submitted using saved answers. Blanks count as incorrect. Unsaved answers on student devices cannot be included. Submitted attempts stay final unless a leader explicitly approves an individual retake.' : 'Grades will become visible to students and feed existing exam averages. Retakes keep the higher score. Paper makeup records are preserved.'}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button disabled={busy} onClick={() => confirm && void action(confirm)}>{busy ? 'Saving…' : confirm === 'ready' ? 'Set ready to open' : confirm === 'reset' ? 'Reset test opening' : confirm === 'close' ? 'Close and submit saved answers' : 'Release results'}</Button></div></DialogContent></Dialog>
  </div>
}
