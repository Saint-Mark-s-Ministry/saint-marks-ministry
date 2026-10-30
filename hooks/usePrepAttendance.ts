'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { latestAttendanceSave, type AttendanceSaveInfo } from '@/lib/attendance-save-info'
import { draftRecord, prepAttendanceDraftKey, readPrepAttendanceDraft, recordVersion, type PrepAttendanceDraft, type PrepAttendanceRecord } from '@/lib/prep-attendance-draft'

interface ExpectedAbsence { id: string; reason: string; markAsNA: boolean }
interface State {
  key: string
  records: PrepAttendanceDraft
  pending: PrepAttendanceDraft
  expectedAbsences: Map<string, ExpectedAbsence>
  excludedIds: string[]
  loading: boolean
  saving: boolean
  finalizing: boolean
  recovered: boolean
  storageError: boolean
  error: string | null
  saveError: string | null
  retryable: boolean
  lastSaved: Date | null
  lastSavedBy: AttendanceSaveInfo | null
}
const initial: State = {
  key: '', records: {}, pending: {}, expectedAbsences: new Map(), excludedIds: [], loading: true,
  saving: false, finalizing: false, recovered: false, storageError: false, error: null,
  saveError: null, retryable: false, lastSaved: null, lastSavedBy: null,
}
class RequestError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}
async function request<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const res = await fetch(url, { signal, ...(body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) })
  let value: unknown
  try { value = await res.json() } catch { throw new RequestError('The server did not confirm the save. Please retry.', res.status >= 500) }
  if (!res.ok) throw new RequestError(
    value && typeof value === 'object' && 'error' in value && typeof value.error === 'string' ? value.error : 'Could not load attendance', res.status >= 500,
  )
  return value as T
}

export function usePrepAttendance(userId: string, lessonId: string, rosterIds: string[], canEdit: boolean, ready: boolean) {
  const key = userId && lessonId && ready ? prepAttendanceDraftKey(userId, lessonId) : ''
  const rosterKey = JSON.stringify(rosterIds)
  const [state, setState] = useState<State>(initial)
  const current = useRef<State>(initial)
  const controller = useRef<AbortController | null>(null)
  const [retry, setRetry] = useState(0)
  const publish = useCallback((next: State) => { current.current = next; setState(next) }, [])
  const persist = useCallback((pending: PrepAttendanceDraft) => {
    try {
      if (Object.keys(pending).length) localStorage.setItem(key, JSON.stringify(Object.values(pending).map(draftRecord)))
      else localStorage.removeItem(key)
      return false
    } catch { return true }
  }, [key])

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    const memory = current.current.key === key ? current.current.pending : {}
    publish({ ...initial, key })
    if (!key) return () => abort.abort()
    let release: (() => void) | undefined
    const load = async () => {
      try {
        const [saved, expected] = await Promise.all([
          request<PrepAttendanceRecord[]>(`/api/attendance?lessonId=${encodeURIComponent(lessonId)}`, abort.signal),
          request<Array<ExpectedAbsence & { studentId: string }>>(`/api/expected-absences?lessonId=${encodeURIComponent(lessonId)}`, abort.signal),
        ])
        if (abort.signal.aborted) return
        if (!Array.isArray(saved) || !Array.isArray(expected)) throw new Error('Could not load attendance safely. Please retry.')
        const allowed = new Set<string>(JSON.parse(rosterKey))
        const records: PrepAttendanceDraft = Object.fromEntries(saved.filter(r => allowed.has(r.studentId)).map(r => [r.studentId, r]))
        const absences = new Map<string, ExpectedAbsence>()
        for (const absence of expected) {
          absences.set(absence.studentId, absence)
          if (allowed.has(absence.studentId) && !records[absence.studentId]) records[absence.studentId] = {
            studentId: absence.studentId, status: absence.markAsNA ? 'EXCUSED' : 'ABSENT', notes: absence.reason,
          }
        }
        let draft: PrepAttendanceDraft = {}, storageError = false
        if (canEdit) {
          try { draft = readPrepAttendanceDraft(key) } catch { storageError = true }
          draft = { ...draft, ...memory }
        }
        const pending = Object.fromEntries(Object.entries(draft).filter(([id]) => allowed.has(id)))
        publish({ ...initial, key, records: { ...records, ...pending }, pending,
          expectedAbsences: absences, loading: false, recovered: Object.keys(pending).length > 0,
          storageError, lastSavedBy: latestAttendanceSave(saved) })
      } catch (error: unknown) {
        if (!abort.signal.aborted) publish({ ...initial, key, pending: memory, loading: false,
          error: error instanceof Error ? error.message : 'Could not load attendance' })
      }
    }
    if (canEdit && navigator.locks) {
      void navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (abort.signal.aborted) return
        if (!lock) { publish({ ...initial, key, loading: false, error: 'This lesson is open in another tab. Close that tab and retry.' }); return }
        await new Promise<void>(resolve => { release = resolve; void load() })
      }).catch(() => { if (!abort.signal.aborted) publish({ ...initial, key, loading: false, error: 'Could not open attendance safely. Please retry.' }) })
    } else void load()
    return () => { abort.abort(); release?.() }
  }, [key, lessonId, rosterKey, canEdit, retry, publish])

  const mark = (studentId: string, changes: Partial<PrepAttendanceRecord>) => {
    const prev = current.current
    if (!canEdit || prev.key !== key || prev.loading || prev.error || prev.finalizing || prev.excludedIds.includes(studentId) || !rosterIds.includes(studentId)) return
    const record = draftRecord({ ...(prev.records[studentId] ?? { studentId, status: 'PRESENT' as const }), ...changes, studentId })
    const pending = { ...prev.pending, [studentId]: record }
    publish({ ...prev, records: { ...prev.records, [studentId]: record }, pending, storageError: persist(pending), saveError: null, retryable: false })
  }

  const save = useCallback(async (finishIds?: string[]) => {
    const prev = current.current, abort = controller.current
    if (!canEdit || !key || prev.key !== key || prev.loading || prev.error || prev.saving || !abort || abort.signal.aborted) return false
    const sent = { ...prev.pending }
    const allowed = new Set<string>(JSON.parse(rosterKey))
    for (const id of finishIds ?? []) {
      if (allowed.has(id) && !prev.excludedIds.includes(id)) sent[id] = draftRecord(prev.records[id] ?? { studentId: id, status: 'ABSENT' })
    }
    if (!Object.keys(sent).length) return false
    publish({ ...prev, records: { ...prev.records, ...sent }, pending: sent, saving: true, finalizing: !!finishIds,
      storageError: persist(sent), saveError: null, retryable: false })
    try {
      const result = await request<{ success: boolean; lastSavedBy?: AttendanceSaveInfo | null; skippedStudentIds?: string[] }>(
        '/api/attendance/batch', abort.signal, { lessonId, expectedUserId: userId, finalize: !!finishIds, records: Object.values(sent).map(draftRecord) },
      )
      if (abort.signal.aborted) return false
      if (result.success !== true) throw new RequestError('The server did not confirm the save. Please retry.', true)
      const latest = current.current, remaining = { ...latest.pending }, records = { ...latest.records }
      const skipped = new Set(result.skippedStudentIds ?? [])
      for (const [id, record] of Object.entries(sent)) {
        if (remaining[id] && recordVersion(remaining[id]) === recordVersion(record)) delete remaining[id]
        if (skipped.has(id)) { delete remaining[id]; delete records[id] }
      }
      publish({ ...latest, records, pending: remaining, saving: false, finalizing: false, recovered: false,
        excludedIds: Array.from(new Set([...latest.excludedIds, ...skipped])), storageError: persist(remaining),
        saveError: null, retryable: false, lastSaved: result.lastSavedBy ? new Date(result.lastSavedBy.savedAt) : latest.lastSaved,
        lastSavedBy: result.lastSavedBy ?? latest.lastSavedBy })
      return !finishIds || skipped.size === 0
    } catch (error: unknown) {
      if (!abort.signal.aborted) publish({ ...current.current, saving: false, finalizing: false,
        saveError: error instanceof Error ? error.message : 'Could not save attendance',
        retryable: error instanceof TypeError || (error instanceof RequestError && error.retryable) })
      return false
    }
  }, [canEdit, key, lessonId, userId, rosterKey, persist, publish])

  useEffect(() => {
    if (state.key !== key || !canEdit || state.loading || state.error || state.saving || state.recovered || !Object.keys(state.pending).length || (state.saveError && !state.retryable)) return
    const flush = () => { if (navigator.onLine) void save() }
    const timer = window.setTimeout(flush, state.saveError ? 5000 : 600)
    window.addEventListener('online', flush)
    return () => { window.clearTimeout(timer); window.removeEventListener('online', flush) }
  }, [state, key, canEdit, save])

  useEffect(() => {
    if (!state.storageError || !Object.keys(state.pending).length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.storageError, state.pending])

  return { ...(state.key === key ? state : initial), mark, save, retryLoad: () => setRetry(n => n + 1) }
}
