import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PublicFooter } from '@/components/ds/public-frame'
import { PublicThemeMenu } from '@/components/public-theme-menu'
import { PublicPageMotion } from '@/components/public-page-motion'

/** Public app information and help stay readable without a ministry account. */
export function MinistryPublicPage({ children, currentPage }: { children: ReactNode; currentPage: 'app' | 'support' }) {
  return (
    <PublicPageMotion>
      <div className="flex min-h-dvh flex-col bg-canvas text-ink">
        <a href="#main" className="sr-only z-50 rounded-md bg-surface px-4 py-3 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-8">
            <Link href="/app" className="flex items-center gap-3 text-ink no-underline">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-[#FAF8F6]">
                <Image src="/st-mark-logo.png" alt="" width={36} height={31} className="h-8 w-auto object-contain" />
              </span>
              <span className="font-display text-xl font-medium">Saint Mark&apos;s Ministry</span>
            </Link>
            <nav aria-label="Main navigation" className="flex items-center gap-1 text-sm">
              <Link href="/app" aria-current={currentPage === 'app' ? 'page' : undefined} className="rounded-md px-3 py-3 text-ink-2 no-underline hover:bg-hover aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-ink">About</Link>
              <Link href="/support" aria-current={currentPage === 'support' ? 'page' : undefined} className="rounded-md px-3 py-3 text-ink-2 no-underline hover:bg-hover aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent-ink">Support</Link>
              <PublicThemeMenu />
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 md:px-8">
          {children}
        </main>
        <div className="mt-12 border-t border-line px-5 py-8">
          <PublicFooter />
        </div>
      </div>
    </PublicPageMotion>
  )
}
