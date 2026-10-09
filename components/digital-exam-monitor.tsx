'use client'
import { useEffect, useRef, useState } from 'react'
import Pusher from 'pusher-js'
import { toast } from 'sonner'
import { useDigitalExam } from '@/lib/swr'
import type { DigitalExamView } from '@/lib/digital-exam-types'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ANSWER_CHOICES } from '@/lib/digital-exams'
import { formatDateUTC } from '@/lib/utils'

const eventLabel: Record<string, string> = { STARTED: 'Started exam', HIDDEN: 'Left exam tab', HIDDEN_RECOVERY: 'Hidden tab detected', RETURNED: 'Returned to exam tab', BLUR: 'Window lost focus', FOCUS: 'Window regained focus', OFFLINE: 'Lost internet connection', RECONNECTED: 'Reconnected — clearance required', CONTACT_LOST: 'Contact lost — clearance required', SESSION_RECOVERY: 'Recovered answering session', UNLOCKED: 'Unlocked by proctor', SUBMITTED: 'Submitted final answers', CLOSED_BY_PROCTOR: 'Finalized when exam closed' }
const departureKinds = new Set(['HIDDEN', 'HIDDEN_RECOVERY', 'OFFLINE', 'CONTACT_LOST', 'SESSION_RECOVERY', 'RECONNECTED'])
function Configuration({ view, save, busy }: { view: DigitalExamView; save: (counts: number[], key: string[]) => void; busy: boolean }) {
  const [counts, setCounts] = useState(view.sheet?.choiceCounts ?? Array(50).fill(4))
  const [key, setKey] = useState(view.answerKey ?? Array(50).fill(''))
  return <Panel title="Set up the original exam" description="Printed questions · 50 equally weighted answers · Makeup exams stay on paper" bodyClassName="p-4">
    <p className="mb-4 text-sm text-ink-3">Enter every correct answer before opening. The answer key and choices lock when the exam first opens.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{key.map((answer, i) => <div key={i} className="flex items-center gap-2"><span className="w-6 text-sm tabular-nums">{i + 1}.</span><select aria-label={`Question ${i + 1} choices`} value={counts[i]} onChange={e => { const next = [...counts]; next[i] = Number(e.target.value); setCounts(next); if (key[i] && key[i].charCodeAt(0) - 65 >= next[i]) { const answers = [...key]; answers[i] = ''; setKey(answers) } }} className="rounded-md border border-line bg-surface p-2 text-sm">{[4, 5, 6, 7, 8].map(n => <option key={n} value={n}>A–{ANSWER_CHOICES[n - 1]}</option>)}</select><select aria-label={`Question ${i + 1} correct answer`} value={answer} onChange={e => { const next = [...key]; next[i] = e.target.value; setKey(next) }} className="rounded-md border border-line bg-surface p-2 text-sm"><option value="">Key</option>{ANSWER_CHOICES.slice(0, counts[i]).split('').map(a => <option key={a}>{a}</option>)}</select></div>)}</div>
    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-sm text-ink-3">{key.filter(Boolean).length}/50 key answers entered</p><Button disabled={busy || key.some(a => !a)} onClick={() => save(counts, key)}>Save answer sheet setup</Button></div>
  </Panel>
}
export function DigitalExamMonitor({ examId }: { examId: string }) {
  const { data, error, mutate } = useDigitalExam(examId)
  const [busy, setBusy] = useState(false)
  const [sound, setSound] = useState(false)
  const [live, setLive] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'release' | 'reset' | null>(null)
  const [alerts, setAlerts] = useState<string[]>([])
  const seen = useRef<Set<string> | null>(null)
  const audio = useRef<AudioContext | null>(null)
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
    const allEvents = data.roster.flatMap(row => row.attempt?.events.map(event => ({ ...event, name: row.student.name })) ?? [])
    if (!seen.current) { seen.current = new Set(allEvents.map(e => e.id)); return }
    const fresh = allEvents.filter(e => !seen.current!.has(e.id))
    for (const event of fresh) {
      seen.current.add(event.id)
      if (!departureKinds.has(event.kind)) continue
      const text = `${event.name}: ${eventLabel[event.kind] ?? event.kind}`
      setAlerts(previous => [text, ...previous].slice(0, 8)); toast.warning(text)
      if (sound && audio.current) {
        const oscillator = audio.current.createOscillator(); const gain = audio.current.createGain()
        gain.gain.setValueAtTime(0.12, audio.current.currentTime); oscillator.frequency.value = 740
        oscillator.connect(gain); gain.connect(audio.current.destination); oscillator.start(); oscillator.stop(audio.current.currentTime + 0.18)
      }
    }
  }, [data?.roster, sound])
  useEffect(() => () => { void audio.current?.close() }, [])
  async function action(name: string, payload: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const response = await fetch(`/api/digital-exams/${examId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: name, ...payload }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update the exam.')
      toast.success(name === 'reset' ? 'Test opening reset; answer key and grades preserved' : name === 'configure' ? 'Answer sheet setup saved' : name === 'unlock' ? 'Student unlocked' : name === 'release' ? 'Results released' : name === 'open' ? 'Exam opened' : 'Exam closed and saved answers submitted')
      await mutate()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not update the exam.') }
    finally { setBusy(false); setConfirm(null) }
  }
  if (error) return <p role="alert">Could not load exam monitoring. Refresh to retry.</p>
  if (!data) return <p>Loading exam monitoring…</p>
  const manage = data.canManage
  const sheet = data.sheet
  const roster = data.roster ?? []
  const started = roster.filter(r => r.attempt).length
  const paused = roster.filter(r => r.attempt?.state === 'PAUSED').length
  const submitted = roster.filter(r => r.attempt?.state === 'SUBMITTED').length
  return <div className="flex flex-col gap-5">
    <PageHeader title={data.exam.examSection.displayName} meta={['Original exam monitoring', formatDateUTC(data.exam.examDate), sheet?.state ?? 'Not configured']} back={{ href: '/dashboard/admin/exam-monitoring', label: 'Exam Monitoring' }} actions={manage && sheet && <>{sheet.state !== 'OPEN' && !sheet.releasedAt && <Button disabled={busy} onClick={() => void action('open')}>Open exam</Button>}{sheet.state === 'OPEN' && <Button variant="outline" disabled={busy} onClick={() => setConfirm('close')}>Close exam</Button>}{sheet.state === 'CLOSED' && !sheet.releasedAt && <Button disabled={busy} onClick={() => setConfirm('release')}>Release results</Button>}</>} />
    {manage && !sheet?.openedAt && <Configuration key={`${sheet?.choiceCounts.join('')}:${data.answerKey?.join('')}`} view={data} busy={busy} save={(choiceCounts, answerKey) => void action('configure', { choiceCounts, answerKey })} />}
    {manage && sheet?.openedAt && !sheet.releasedAt && !data.hasAttempts && <Panel title="Opened only for testing?" bodyClassName="p-4"><p className="mb-3 text-sm">Nobody has joined. Reset the test opening to hide the answer sheet from students and return it to draft. The answer key and all existing grades are preserved.</p><Button variant="outline" disabled={busy} onClick={() => setConfirm('reset')}>Reset test opening</Button></Panel>}
    {!manage && !sheet && <Panel bodyClassName="p-4">An exam leader has not configured an answer sheet yet.</Panel>}
    {sheet && <>
      <Panel title="Live monitoring" description="Activity flags support proctor review; they do not establish cheating." actions={<Button variant="outline" size="sm" onClick={() => { if (!sound) { audio.current ??= new AudioContext(); void audio.current.resume() } setSound(!sound) }}>{sound ? 'Mute alert sound' : 'Enable alert sound'}</Button>} bodyClassName="p-4">
        <div className="flex flex-wrap gap-5 text-sm"><span>{started}/{roster.filter(r => r.eligible).length} started</span><span>{paused} paused</span><span>{submitted} submitted</span><span className={live ? 'text-ok' : 'text-ink-3'}>{live ? 'Live alerts connected · Refresh backup active' : 'Monitoring refreshes every 2 seconds'}</span></div>
        {sheet.releasedAt && <p className="mt-3 text-sm text-ok">Results released {new Date(sheet.releasedAt).toLocaleString()}</p>}
        {alerts.length > 0 && <div role="log" aria-live="polite" className="mt-4 rounded-md border border-warn/30 bg-warn/10 p-3"><div className="mb-2 flex justify-between"><strong className="text-sm">Recent alerts</strong><button className="text-xs underline" onClick={() => setAlerts([])}>Dismiss</button></div>{alerts.map((text, i) => <p key={`${i}-${text}`} className="text-sm">{text}</p>)}</div>}
      </Panel>
      <Panel title="Students" description="A stale connection means no contact for more than 30 seconds. Students must return and reconnect before unlocking.">
        {roster.length === 0 && <p className="p-4 text-sm text-ink-3">No eligible students.</p>}
        <ul className="divide-y divide-line">{roster.map(row => {
          const attempt = row.attempt
          return <li key={row.student.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{row.student.name}{!row.eligible && <span className="ml-2 text-xs text-ink-3">Historical attempt</span>}</p><p className="mt-1 text-sm text-ink-3">{attempt ? `${attempt.state === 'SUBMITTED' ? 'Submitted' : attempt.state === 'PAUSED' ? 'Paused' : 'Answering'} · ${attempt.answeredCount}/50 answered${attempt.state !== 'SUBMITTED' && attempt.stale ? ' · Connection stale' : ''}` : 'Not started'}</p>{attempt && <p className="mt-1 text-xs text-ink-3">Last contact: {new Date(attempt.lastSeenAt).toLocaleTimeString()}{attempt.submittedAt ? ` · Submitted ${new Date(attempt.submittedAt).toLocaleTimeString()} · ${attempt.correctCount}/50` : ''}</p>}</div>{manage && attempt?.state === 'PAUSED' && <Button size="sm" variant="outline" disabled={busy || attempt.stale || sheet.state !== 'OPEN'} onClick={() => void action('unlock', { attemptId: attempt.id })}>Unlock student</Button>}</div>
            {attempt && <details className="mt-3 text-sm"><summary className="cursor-pointer text-ink-3">Activity history ({attempt.events.length})</summary><ol className="mt-2 space-y-1 border-l border-line pl-3">{attempt.events.map(event => <li key={event.id}><time className="mr-2 text-xs text-ink-3">{new Date(event.createdAt).toLocaleString()}</time>{eventLabel[event.kind] ?? event.kind}{event.kind === 'UNLOCKED' && <span className="ml-2 text-xs text-ink-3">Proctor action</span>}</li>)}</ol></details>}
          </li>
        })}</ul>
      </Panel>
    </>}
    {!!data.completedHistory?.length && <Panel title="Past digital activity" bodyClassName="p-4"><details><summary className="cursor-pointer text-sm text-ink-3">View preserved activity history ({data.completedHistory.length} graded attempts)</summary><div className="mt-3 space-y-4">{data.completedHistory.map(row => <div key={row.student.id}><p className="text-sm font-medium">{row.student.name}</p><ol className="mt-2 space-y-1 border-l border-line pl-3">{row.events.map(event => <li key={event.id} className="text-sm"><time className="mr-2 text-xs text-ink-3">{new Date(event.createdAt).toLocaleString()}</time>{eventLabel[event.kind] ?? event.kind}</li>)}</ol></div>)}</div></details></Panel>}
    <Dialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null) }}><DialogContent><DialogHeader><DialogTitle>{confirm === 'reset' ? 'Reset this test opening?' : confirm === 'close' ? 'Close and finalize this exam?' : 'Release exam results?'}</DialogTitle><DialogDescription>{confirm === 'reset' ? 'This returns the answer sheet to draft and hides it from students. The answer key and all saved grades are preserved. Reset is blocked if any student has joined.' : confirm === 'close' ? 'All started attempts will be submitted using saved answers. Blanks count as incorrect. Unsaved answers on student devices cannot be included. Submitted attempts cannot reopen.' : 'Grades will become visible to students and feed existing exam averages. This action does not change paper makeup grades.'}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button><Button disabled={busy} onClick={() => confirm && void action(confirm)}>{busy ? 'Saving…' : confirm === 'reset' ? 'Reset test opening' : confirm === 'close' ? 'Close and submit saved answers' : 'Release results'}</Button></div></DialogContent></Dialog>
  </div>
}
