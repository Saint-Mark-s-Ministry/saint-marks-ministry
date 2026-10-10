'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { isLegalPath, LEGAL_RETURN_PATH_KEY } from '@/lib/legal-navigation'

const ENTER_DURATION_MS = 200

export function NavigationTransition() {
  const pathname = usePathname()
  const router = useRouter()
  const previousPathname = useRef(pathname)
  const cleanupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const root = document.documentElement

    if (previousPathname.current === pathname) return
    previousPathname.current = pathname

    if (cleanupTimer.current) clearTimeout(cleanupTimer.current)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.remove('page-transition-in')
      return
    }

    root.classList.add('page-transition-in')
    cleanupTimer.current = setTimeout(() => {
      root.classList.remove('page-transition-in')
    }, ENTER_DURATION_MS)
  }, [pathname])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target
      if (!(target instanceof Element)) return

      const anchor = target.closest<HTMLAnchorElement>('a[href]')
      if (
        !anchor ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self') ||
        anchor.hasAttribute('data-no-page-transition')
      ) {
        return
      }

      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return

      const currentLocation = `${window.location.pathname}${window.location.search}`
      const nextLocation = `${destination.pathname}${destination.search}`
      if (currentLocation === nextLocation) return

      if (isLegalPath(destination.pathname) && !isLegalPath(window.location.pathname)) {
        sessionStorage.setItem(
          LEGAL_RETURN_PATH_KEY,
          `${currentLocation}${window.location.hash}`
        )
      }

      // Navigate immediately and leave the current screen visible until Next.js
      // shows the destination's loading fallback or content.
      event.preventDefault()
      router.push(`${nextLocation}${destination.hash}`)
    }

    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('click', handleClick, true)
      if (cleanupTimer.current) clearTimeout(cleanupTimer.current)
      document.documentElement.classList.remove('page-transition-in')
    }
  }, [router])

  return null
}
