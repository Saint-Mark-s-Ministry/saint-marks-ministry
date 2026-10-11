'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AttemptResponse, DigitalExamView, ExamAttemptView } from '@/lib/digital-exam-types'
import { safeExamDestination } from '@/lib/digital-exams'
import type { ClientEventKind } from '@/lib/digital-exams'

type PendingEvent = { id: string; kind: ClientEventKind; at: string; destinationPath?: string }
type Draft = { attemptNumber?: number; answers: Record<string, string>; events: PendingEvent[] }
export function useExamAttempt(examId: string, userId: string, view?: DigitalExamView, refresh?: () => Promise<unknown>) {
  const [attempt, setAttempt] = useState<ExamAttemptView | null>(null)
  const [started, setStarted] = useState(false)
  const [locallyPaused, setLocallyPaused] = useState(false)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [, setDraftVersion] = useState(0)
  const current = useRef<ExamAttemptView | null>(null)
  const token = useRef('')
  const draft = useRef<Draft>({ answers: {}, events: [] })
  const saving = useRef(false)
  const sendingEvents = useRef(false)
  const paused = useRef(false)
  const own = useRef(false)
  const networkLost = useRef(false)
  const releaseLock = useRef<(() => void) | null>(null)
  const storageKey = `digital-exam:${userId}:${examId}`
  const persist = useCallback(() => {
    setPendingCount(Object.keys(draft.current.answers).length)
    setDraftVersion(value => value + 1)
    try { localStorage.setItem(storageKey, JSON.stringify(draft.current)) } catch { setMessage('This browser cannot preserve pending changes. Keep this page open until every answer is saved.') }
  }, [storageKey])
  const apply = useCallback((next: ExamAttemptView) => {
    if (current.current && next.revision < current.current.revision) return
    if (current.current && (next.attemptNumber ?? 1) !== (current.current.attemptNumber ?? 1)) {
      own.current = false; setStarted(false); releaseLock.current?.(); releaseLock.current = null
    }
    if ((next.attemptNumber ?? 1) !== (draft.current.attemptNumber ?? 1)) {
      draft.current = { attemptNumber: next.attemptNumber, answers: {}, events: [] }; persist()
    }
    current.current = next; setAttempt(next)
    if (next.state === 'SUBMITTED') {
      draft.current = { attemptNumber: next.attemptNumber, answers: {}, events: [] }; persist(); setPendingCount(0)
      releaseLock.current?.(); releaseLock.current = null
    }
    if (!draft.current.events.length && next.state === 'ACTIVE' && navigator.onLine && !document.hidden) {
      paused.current = false; setLocallyPaused(false)
    }
  }, [persist])
  const post = useCallback(async (payload: Record<string, unknown>): Promise<AttemptResponse> => {
    const response = await fetch(`/api/digital-exams/${examId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, sessionToken: token.current, visible: !document.hidden }), keepalive: payload.action === 'events' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Could not save exam changes.')
    if (data.attempt) apply(data.attempt)
    return data
  }, [examId, apply])
  const flushEvents = useCallback(async () => {
    if (!own.current || sendingEvents.current || !navigator.onLine || !draft.current.events.length || current.current?.state === 'SUBMITTED') return
    sendingEvents.current = true
    const batch = draft.current.events.slice(0, 100)
    try {
      await post({ action: 'events', events: batch })
      const ids = new Set(batch.map(e => e.id))
      draft.current.events = draft.current.events.filter(e => !ids.has(e.id)); persist()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Activity report is waiting to reconnect.') }
    finally { sendingEvents.current = false }
  }, [post, persist])
  const event = useCallback((kind: ClientEventKind) => {
    if (!own.current || current.current?.state === 'SUBMITTED') return
    if (['HIDDEN', 'BLUR', 'OFFLINE', 'RECONNECTED', 'SITE_NAVIGATION'].includes(kind)) { paused.current = true; setLocallyPaused(true) }
    draft.current.events.push({ id: crypto.randomUUID(), kind, at: new Date().toISOString() }); persist()
    void flushEvents()
  }, [persist, flushEvents])
  const flushAnswers = useCallback(async () => {
    if (saving.current || !own.current || paused.current || !navigator.onLine || document.hidden || current.current?.state !== 'ACTIVE') return
    saving.current = true
    try {
      while (Object.keys(draft.current.answers).length && !paused.current && navigator.onLine && !document.hidden && current.current?.state === 'ACTIVE') {
        const question = Object.keys(draft.current.answers)[0]; const answer = draft.current.answers[question]
        const response = await post({ action: 'save', question: Number(question), answer, revision: current.current.revision })
        if (response.blocked) { paused.current = true; setLocallyPaused(true); break }
        if (draft.current.answers[question] === answer) { delete draft.current.answers[question]; persist() }
      }
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Answers are waiting to save.')
      // A network failure may occur before navigator.onLine changes.
      if (error instanceof TypeError) { if (!networkLost.current) event('OFFLINE'); networkLost.current = true; setOffline(true) }
      await refresh?.()
    } finally { saving.current = false }
  }, [post, persist, event, refresh])
  useEffect(() => {
    if (started && view?.attempt) apply(view.attempt)
  }, [started, view?.attempt, apply])
  useEffect(() => {
    if (!started) return
    const visibility = () => event(document.hidden ? 'HIDDEN' : 'RETURNED')
    const blur = () => event('BLUR'); const focus = () => event('FOCUS')
    const disconnected = () => { setOffline(true); if (!networkLost.current) event('OFFLINE'); networkLost.current = true }
    const connected = () => { networkLost.current = false; setOffline(false); event('RECONNECTED'); if (!document.hidden) event('RETURNED') }
    const pagehide = () => event('HIDDEN')
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', blur); window.addEventListener('focus', focus)
    window.addEventListener('offline', disconnected); window.addEventListener('online', connected)
    window.addEventListener('pagehide', pagehide)
    const heartbeat = setInterval(() => {
      if (!own.current || current.current?.state === 'SUBMITTED' || !navigator.onLine) return
      void flushEvents().then(() => post({ action: 'heartbeat' })).then(() => { if (networkLost.current) connected() }).catch(error => { setMessage(error instanceof Error ? error.message : 'Connection lost.'); if (error instanceof TypeError) disconnected() })
    }, 10000)
    const retry = setInterval(() => { void flushEvents(); void flushAnswers() }, 1500)
    return () => {
      clearInterval(heartbeat); clearInterval(retry)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('blur', blur); window.removeEventListener('focus', focus)
      window.removeEventListener('offline', disconnected); window.removeEventListener('online', connected)
      window.removeEventListener('pagehide', pagehide)
    }
  }, [started, event, post, flushEvents, flushAnswers])
  const navigationReporter = useRef<(() => void) | null>(null)
  useEffect(() => {
    navigationReporter.current = () => {
      const destinationPath = safeExamDestination(window.location.pathname)
      if (!own.current || current.current?.state === 'SUBMITTED' || !destinationPath) return
      const navigation: PendingEvent = { id: crypto.randomUUID(), kind: 'SITE_NAVIGATION', at: new Date().toISOString(), destinationPath }
      paused.current = true
      draft.current.events.push(navigation); persist()
      // Send even if another event batch is in flight. Retry IDs prevent duplicates;
      // the durable local draft also retries this report when the student returns.
      void post({ action: 'events', events: [navigation] }).catch(() => {})
    }
  }, [post, persist])
  useEffect(() => {
    const initialPath = window.location.pathname
    return () => {
      if (window.location.pathname !== initialPath) navigationReporter.current?.()
      own.current = false; releaseLock.current?.()
    }
  }, [])
  async function start() {
    setBusy(true); setMessage('')
    try {
      if (!navigator.onLine || document.hidden) throw new Error('Return to this tab and connect to the internet before starting.')
      if (navigator.locks && !releaseLock.current) {
        await new Promise<void>((resolve, reject) => {
          void navigator.locks.request(storageKey, { ifAvailable: true }, async lock => {
            if (!lock) { reject(new Error('This exam is already open in another tab.')); return }
            await new Promise<void>(release => { releaseLock.current = release; resolve() })
          }).catch(reject)
        })
      }
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      token.current = navigation?.type === 'reload' ? sessionStorage.getItem(`${storageKey}:session`) || crypto.randomUUID() : crypto.randomUUID()
      sessionStorage.setItem(`${storageKey}:session`, token.current)
      try { const stored = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (stored && typeof stored.answers === 'object' && Array.isArray(stored.events)) draft.current = stored } catch { /* The saved server answers remain authoritative. */ }
      const result = await post({ action: 'start' })
      if (result.attempt.state !== 'SUBMITTED') {
        own.current = true
        if (draft.current.events.length || Object.keys(draft.current.answers).length) {
          paused.current = true; setLocallyPaused(true); event('RECONNECTED'); event('RETURNED'); await flushEvents()
        }
      }
      setStarted(true); persist(); await refresh?.()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not start.'); releaseLock.current?.(); releaseLock.current = null }
    finally { setBusy(false) }
  }
  function choose(question: number, answer: string) {
    if (paused.current || offline || !navigator.onLine || document.hidden || current.current?.state !== 'ACTIVE' || view?.sheet?.state !== 'OPEN') return
    draft.current.answers[String(question)] = answer; persist(); void flushAnswers()
  }
  async function submit() {
    setBusy(true)
    try {
      await flushAnswers()
      if (saving.current || Object.keys(draft.current.answers).length || draft.current.events.length) throw new Error('Wait until every answer and activity report is saved before submitting.')
      if (paused.current) throw new Error('A proctor must unlock your exam before you can submit.')
      await post({ action: 'submit', revision: current.current?.revision }); await refresh?.()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not submit.') }
    finally { setBusy(false) }
  }
  const answers = [...(attempt?.answers ?? Array(50).fill(''))]
  for (const [question, answer] of Object.entries(draft.current.answers)) answers[Number(question)] = answer
  return { attempt, answers, started, busy, message, pendingCount, offline, paused: locallyPaused || attempt?.state === 'PAUSED', start, choose, submit }
}
