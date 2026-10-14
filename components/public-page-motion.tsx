'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import styles from './ministry-public-page.module.css'

/** Progressive enhancement: content is visible even without JS or motion APIs. */
export function PublicPageMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (preference.matches || !root.current || !('IntersectionObserver' in window)) return

    const animations = new Set<Animation>()
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        observer.unobserve(entry.target)
        if (preference.matches || typeof entry.target.animate !== 'function') continue
        const animation = entry.target.animate(
          [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        )
        animations.add(animation)
        animation.onfinish = () => animations.delete(animation)
      }
    }, { threshold: 0.08 })

    root.current.querySelectorAll('[data-reveal]').forEach(element => observer.observe(element))
    const stopMotion = () => {
      if (!preference.matches) return
      observer.disconnect()
      animations.forEach(animation => animation.cancel())
      animations.clear()
    }
    preference.addEventListener('change', stopMotion)
    return () => {
      observer.disconnect()
      preference.removeEventListener('change', stopMotion)
      animations.forEach(animation => animation.cancel())
    }
  }, [])

  return <div ref={root} className={styles.page}>{children}</div>
}
