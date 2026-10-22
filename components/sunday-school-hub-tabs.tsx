'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

export interface HubTab {
  href: string
  label: string
  count?: number
}

/**
 * The tab row under a hub page's header (Attendance, Care, Lessons). Each tab
 * is its own URL, so existing links keep working; it looks like the design
 * system's Segmented control but navigates instead of filtering.
 */
export function SundaySchoolHubTabs({ tabs, label, className }: { tabs: HubTab[]; label: string; className?: string }) {
  const pathname = usePathname()
  const search = useSearchParams()?.toString() ?? ''
  if (tabs.length < 2) return null

  const isCurrent = (href: string) => {
    const [path, query] = href.split('?')
    if (pathname !== path) return false
    if (query) return new URLSearchParams(search).toString().includes(query)
    return !tabs.some(other => other.href !== href && other.href.startsWith(`${path}?`) && search.includes(other.href.split('?')[1]))
  }

  return (
    <nav
      aria-label={label}
      className={cn('inline-flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-[8px] bg-hover p-[3px] md:h-8', className)}
    >
      {tabs.map(tab => {
        const current = isCurrent(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={cn(
              'inline-flex h-full shrink-0 items-center gap-1.5 rounded-[5px] px-3 text-[13px] font-medium whitespace-nowrap no-underline transition-colors',
              current
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(27,24,23,0.08),0_0_0_1px_var(--ds-border-strong)]'
                : 'text-ink-2 hover:text-ink'
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tabular font-normal text-ink-3">{tab.count}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
