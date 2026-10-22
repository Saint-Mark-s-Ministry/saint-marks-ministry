'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface HubTab {
  href: string
  label: string
  count?: number
}

/**
 * The tab row under a hub page's header (Attendance, Care, Lessons). Each tab
 * is its own URL, so existing links keep working; it looks like the design
 * system's Segmented control but navigates instead of filtering. The class
 * comes from Viewing, so tabs never carry a ?classId.
 */
function HubTabs({ tabs, label }: { tabs: HubTab[]; label: string }) {
  const pathname = usePathname()
  if (tabs.length < 2) return null

  return (
    <nav aria-label={label} className="inline-flex h-11 max-w-full items-center gap-0.5 overflow-x-auto rounded-[8px] bg-hover p-[3px] md:h-8">
      {tabs.map(tab => {
        const current = pathname === tab.href
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

/** Attendance: children, and servants for the people who may see them. */
export function AttendanceHubTabs({ showServants }: { showServants: boolean }) {
  return (
    <HubTabs
      label="Who"
      tabs={[
        { href: '/dashboard/servants/attendance', label: 'Children' },
        ...(showServants ? [{ href: '/dashboard/servants/servant-attendance', label: 'Servants' }] : []),
      ]}
    />
  )
}

/** Care keeps Follow up, Visits & calls and Birthdays under one menu entry. */
export function CareHubTabs({ followUpCount }: { followUpCount?: number }) {
  return (
    <HubTabs
      label="Care"
      tabs={[
        { href: '/dashboard/servants/care', label: 'Follow up', count: followUpCount },
        { href: '/dashboard/servants/visitations', label: 'Visits & calls' },
        { href: '/dashboard/servants/birthdays', label: 'Birthdays' },
      ]}
    />
  )
}

/** Lessons, and Homework for Elementary servants. */
export function LessonsHubTabs({ showHomework }: { showHomework: boolean }) {
  return (
    <HubTabs
      label="Lessons"
      tabs={[
        { href: '/dashboard/servants/lessons', label: 'Lessons' },
        ...(showHomework ? [{ href: '/dashboard/servants/homework', label: 'Homework' }] : []),
      ]}
    />
  )
}
