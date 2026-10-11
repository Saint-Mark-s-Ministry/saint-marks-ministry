'use client'

import { useEffect, useState } from 'react'

/** Best-effort prevention of automatic screen locking; monitoring remains active. */
export function useExamScreenAwake(enabled: boolean) {
  const [status, setStatus] = useState<'pending' | 'active' | 'unavailable'>('pending')
  const supported = typeof navigator !== 'undefined' && !!navigator.wakeLock?.request
  useEffect(() => {
    if (!enabled || !supported) return
    let disposed = false
    let requesting = false
    let lock: WakeLockSentinel | null = null
    const released = () => { lock = null; if (!disposed) setStatus('unavailable') }
    const release = () => {
      const current = lock
      lock = null
      if (current) {
        current.removeEventListener('release', released)
        void current.release().catch(() => {})
      }
    }
    async function acquire() {
      if (disposed || document.hidden || requesting || (lock && !lock.released)) return
      requesting = true
      setStatus('pending')
      try {
        const next = await navigator.wakeLock.request('screen')
        if (disposed || document.hidden) { await next.release(); return }
        lock = next
        next.addEventListener('release', released)
        setStatus(next.released ? 'unavailable' : 'active')
      } catch { if (!disposed) setStatus('unavailable') }
      finally { requesting = false }
    }
    const visibility = () => {
      if (document.hidden) { release(); setStatus('unavailable') }
      else void acquire()
    }
    document.addEventListener('visibilitychange', visibility)
    void acquire()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [enabled, supported])
  return !enabled ? 'idle' : !supported ? 'unavailable' : status
}
