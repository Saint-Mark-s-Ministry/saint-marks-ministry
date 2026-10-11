'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AttendanceStatus } from '@prisma/client'
import { getChildPhotoUrl } from '@/lib/sunday-school-class'
import { attendanceDraftKey, mergeAttendanceDraft, readAttendanceDraft, type AttendanceMarks } from '@/lib/sunday-school-attendance-draft'
import type { SundaySchoolChild, SundaySchoolSession, SundaySchoolSessionAttendance } from '@/types/sunday-school'

interface EditorState {
  key: string
  attendance: SundaySchoolSessionAttendance | null
  marks: AttendanceMarks
  pending: AttendanceMarks
  loading: boolean
  saving: boolean
  finalizing: boolean
  retryable: boolean
  error: string | null
  saveError: string | null
  storageError: boolean
  recovered: boolean
  removedCount: number
  lastSaved: Date | null
}

const initial: EditorState = {
  key: '', attendance: null, marks: {}, pending: {}, loading: true, saving: false, finalizing: false, retryable: false,
  error: null, saveError: null, storageError: false, recovered: false, removedCount: 0, lastSaved: null,
}

class AttendanceRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) { super(message) }
}

async function requestJson<T>(url: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    signal,
    ...(body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
  })
  let result: unknown
  try { result = await res.json() } catch {
    throw new AttendanceRequestError('The server did not return a save confirmation. Please retry.', res.status >= 500)
  }
  if (!res.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : 'Could not connect. Please try again.'
    throw new AttendanceRequestError(message, res.status >= 500)
  }
  return result as T
}

export function useSundaySchoolAttendance(userId: string, classId: string, date: string, canEdit: boolean) {
  const key = userId && classId && date ? attendanceDraftKey(userId, classId, date) : ''
  const [state, setState] = useState<EditorState>(initial)
  const current = useRef<EditorState>(initial)
  const controller = useRef<AbortController | null>(null)
  const [retry, setRetry] = useState(0)
  const publish = useCallback((next: EditorState) => {
    current.current = next
    setState(next)
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    controller.current = abort
    const memoryDraft = current.current.key === key ? current.current.pending : {}
    const memoryStorageError = current.current.key === key && current.current.storageError
    publish({ ...initial, key })
    if (!key) return () => abort.abort()
    let release: (() => void) | undefined
    const load = async () => {
      try {
        const sessions = await requestJson<SundaySchoolSession[]>(
          `/api/sunday-school/sessions?${new URLSearchParams({ classId, from: date, to: date })}`, abort.signal)
        if (abort.signal.aborted) return
        let attendance: SundaySchoolSessionAttendance
        if (sessions[0]) {
          attendance = await requestJson(`/api/sunday-school/sessions/${sessions[0].id}/attendance`, abort.signal)
        } else {
          const children = await requestJson<SundaySchoolChild[]>(
            `/api/sunday-school/children?${new URLSearchParams({ classId, isActive: 'true' })}`, abort.signal)
          attendance = { session: null, roster: children.map(child => ({
            id: child.id, firstName: child.firstName, lastName: child.lastName,
            level: child.level, gender: child.gender, profileImageUrl: getChildPhotoUrl(child), attendance: null,
          })) }
        }
        if (abort.signal.aborted) return
        const saved: AttendanceMarks = {}
        for (const entry of attendance.roster) {
          const value = entry.attendance?.status
          if (value === 'PRESENT' || value === 'LATE' || value === 'ABSENT') saved[entry.id] = value
        }
        let draft: AttendanceMarks = {}
        let storageError = false
        // Recovery waits for a fresh authorized roster; old IDs cannot rejoin a class.
        if (canEdit) {
          try { draft = readAttendanceDraft(window.localStorage, key) } catch { storageError = true }
        }
        if (canEdit) draft = { ...draft, ...memoryDraft }
        const merged = mergeAttendanceDraft(saved, draft, attendance.roster.map(entry => entry.id))
        publish({ ...initial, ...merged, key, attendance, loading: false, storageError,
          recovered: Object.keys(draft).length > 0 })
      } catch (error: unknown) {
        if (!abort.signal.aborted) publish({ ...initial, key, pending: memoryDraft, storageError: memoryStorageError, loading: false,
          error: error instanceof Error ? error.message : 'Failed to load attendance' })
      }
    }
    if (canEdit && navigator.locks) {
      void navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (abort.signal.aborted) return
        if (!lock) {
          publish({ ...initial, key, pending: memoryDraft, storageError: memoryStorageError, loading: false, error: 'Attendance for this class and date is open in another tab. Close that tab before retrying' })
          return
        }
        await new Promise<void>(resolve => { release = resolve; void load() })
      }).catch(() => {
        if (!abort.signal.aborted) publish({ ...initial, key, pending: memoryDraft, storageError: memoryStorageError, loading: false, error: 'Could not open attendance safely. Please retry' })
      })
    } else void load()
    return () => { abort.abort(); release?.() }
  }, [key, userId, classId, date, canEdit, retry, publish])

  const persist = useCallback((pending: AttendanceMarks) => {
    try {
      if (Object.keys(pending).length) window.localStorage.setItem(key, JSON.stringify(pending))
      else window.localStorage.removeItem(key)
      return false
    } catch { return true }
  }, [key])

  const mark = (childId: string, value: AttendanceStatus) => {
    const prev = current.current
    if (!canEdit || prev.key !== key || prev.loading || prev.finalizing || !prev.attendance?.roster.some(entry => entry.id === childId)) return
    const pending = { ...prev.pending, [childId]: value }
    publish({ ...prev, marks: { ...prev.marks, [childId]: value }, pending,
      storageError: persist(pending), saveError: null, retryable: false })
  }

  const save = useCallback(async (finalize = true) => {
    const prev = current.current
    const abort = controller.current
    if (!canEdit || !key || prev.key !== key || prev.loading || prev.saving || !prev.attendance || !abort || abort.signal.aborted) return false
    const sent: AttendanceMarks = finalize
      ? Object.fromEntries(prev.attendance.roster.map(entry => [entry.id, prev.marks[entry.id] ?? AttendanceStatus.ABSENT]))
      : { ...prev.pending }
    if (!Object.keys(sent).length) return false
    const pending = { ...prev.pending, ...sent }
    // Persist the exact submission before sending it. Only final save adds absences.
    publish({ ...prev, marks: { ...prev.marks, ...sent }, pending, saving: true, finalizing: finalize,
      storageError: persist(pending), saveError: null, retryable: false })
    try {
      const session = await requestJson<SundaySchoolSession>('/api/sunday-school/sessions', abort.signal,
        { classId, date, expectedUserId: userId })
      if (abort.signal.aborted) return false
      const response = await requestJson<{ success: boolean }>('/api/sunday-school/attendance/batch', abort.signal, {
        sessionId: session.id, expectedUserId: userId,
        records: Object.entries(sent).map(([childId, status]) => ({ childId, status })),
      })
      if (abort.signal.aborted) return false
      if (response.success !== true) throw new Error('The server did not confirm attendance was saved')
      const latest = current.current
      const remaining = { ...latest.pending }
      // A newer tap during an autosave still needs its own acknowledgment.
      for (const [id, value] of Object.entries(sent)) {
        if (remaining[id] === value) delete remaining[id]
      }
      publish({ ...latest, saving: false, finalizing: false, pending: remaining,
        recovered: false, removedCount: 0, saveError: null, retryable: false,
        attendance: { ...prev.attendance, session }, lastSaved: new Date(), storageError: persist(remaining) })
      return true
    } catch (error: unknown) {
      if (!abort.signal.aborted) publish({ ...current.current, saving: false, finalizing: false,
        retryable: error instanceof TypeError || (error instanceof AttendanceRequestError && error.retryable),
        saveError: error instanceof Error ? error.message : 'Could not save attendance' })
      return false
    }
  }, [canEdit, key, classId, date, userId, publish, persist])

  useEffect(() => {
    // Restored drafts require review before sending. Never finalize unmarked children here.
    if (state.key !== key || !canEdit || state.loading || state.saving || state.recovered ||
      !Object.keys(state.pending).length || (state.saveError && !state.retryable)) return
    const flush = () => { if (navigator.onLine) void save(false) }
    const timer = window.setTimeout(flush, state.saveError ? 5000 : 600)
    window.addEventListener('online', flush)
    return () => { window.clearTimeout(timer); window.removeEventListener('online', flush) }
  }, [state.key, state.pending, state.loading, state.saving, state.recovered, state.saveError, state.retryable, key, canEdit, save])

  // Warn when the browser cannot durably preserve unsent marks.
  useEffect(() => {
    if (!state.storageError || !Object.keys(state.pending).length) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.storageError, state.pending])

  return { ...(state.key === key ? state : initial), mark, save, retryLoad: () => setRetry(value => value + 1) }
}
