'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Keep the owning component alive until the shared CSS exit motion finishes.
 * Use close() for action buttons that would otherwise remove a modal directly.
 * Dialog/AlertDialog use it automatically for Escape, backdrop and Close.
 */
export function useModalExit(onClosed: () => void) {
  const [closing, setClosing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    setClosing(false)
  }, [])
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])

  const close = useCallback((afterClose = onClosed) => {
    if (timer.current !== null) return
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const token = getComputedStyle(document.documentElement).getPropertyValue('--modal-motion-duration').trim()
    // Without the stylesheet there is no motion to wait for.
    const duration = reduced ? 0 : (parseFloat(token) || 0) * (token.endsWith('ms') ? 1 : 1000)
    if (!duration) { afterClose(); return }
    setClosing(true)
    // Allow the final animation frame to finish before an owner unmounts us.
    timer.current = setTimeout(() => {
      timer.current = null
      setClosing(false)
      afterClose()
    }, duration + 50)
  }, [onClosed])

  return { closing, close, cancel }
}
