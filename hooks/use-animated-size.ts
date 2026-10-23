'use client'

import { useCallback, type Ref, type RefCallback } from 'react'
import { observeAnimatedSize } from '@/lib/animate-element-size'

/** Attach to the box itself: content changes, async results and viewport
 * resizes animate automatically. Preserves object and React 19 callback refs.
 */
export function useAnimatedSize<T extends HTMLElement>(forwardedRef?: Ref<T>): RefCallback<T> {
  return useCallback((element: T | null) => {
    const releaseRef = typeof forwardedRef === 'function' ? forwardedRef(element) : undefined
    if (forwardedRef && typeof forwardedRef !== 'function') forwardedRef.current = element
    if (!element) return

    const stop = observeAnimatedSize(element)
    return () => {
      stop()
      if (typeof releaseRef === 'function') releaseRef()
      else if (typeof forwardedRef === 'function') forwardedRef(null)
      else if (forwardedRef) forwardedRef.current = null
    }
  }, [forwardedRef])
}
