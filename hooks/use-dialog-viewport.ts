'use client'

import { useLayoutEffect, useState, type CSSProperties } from 'react'

type ViewportStyle = CSSProperties & Record<`--dialog-viewport-${'top' | 'left' | 'height' | 'width'}`, string>

/** Safari's visible viewport changes with its toolbars, keyboard and zoom.
 * Keep the modal inside that rectangle, including when Safari pans it. */
export function useDialogViewport(enabled: boolean): ViewportStyle | undefined {
  const [style, setStyle] = useState<ViewportStyle>()
  useLayoutEffect(() => {
    if (!enabled) return
    const viewport = window.visualViewport
    let frame = 0
    const measure = () => {
      frame = 0
      const height = viewport?.height ?? window.innerHeight
      const width = viewport?.width ?? window.innerWidth
      if (height <= 0 || width <= 0) return
      const next: ViewportStyle = {
        '--dialog-viewport-top': `${viewport?.offsetTop ?? 0}px`,
        '--dialog-viewport-left': `${viewport?.offsetLeft ?? 0}px`,
        '--dialog-viewport-height': `${height}px`,
        '--dialog-viewport-width': `${width}px`,
      }
      setStyle(previous => previous && Object.keys(next).every(key =>
        previous[key as keyof ViewportStyle] === next[key as keyof ViewportStyle]
      ) ? previous : next)
    }
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure) }
    measure()
    viewport?.addEventListener('resize', schedule)
    viewport?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', schedule)
      viewport?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
    }
  }, [enabled])
  return enabled ? style : undefined
}
