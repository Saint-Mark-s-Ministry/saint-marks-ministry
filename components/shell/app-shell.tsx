'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getRoleDisplayName, isAdmin } from '@/lib/roles'
import {
  availableMinistries,
  currentNavLabel,
  navigationFor,
  prepHome,
  resolveMinistry,
  type Ministry,
} from '@/lib/navigation'
import { useDigitalExams, useSundaySchoolAttendanceReminders } from '@/lib/swr'
import { clearContactBookFilters } from '@/hooks/useContactBookFilters'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { MobileAppBar, MobileTabBar } from './mobile-nav'
import { SundaySchoolAttendanceReminderBanner } from '@/components/sunday-school-attendance-reminder-banner'
import { AnnualMentorReminderBanner } from '@/components/annual-mentor-reminder-banner'
import { ProfilePhotoReminder } from '@/components/profile-photo-reminder'
import { PageLoading } from '@/components/ui/page-loading'

const RAIL_KEY = 'sidebar-rail'

/** Signed-in areas get the shell; sign-in, sign-up and legal pages stand alone. */
export function usesAppShell(pathname: string) {
  return pathname.startsWith('/dashboard') || pathname === '/settings'
}

/**
 * Sidebar + fluid content on desktop, an optional 64px rail, app bar + tab
 * bar on phones (design system §07). One shell for every ministry; only the
 * nav groups and the accent change.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  useEffect(() => {
    if (pathname !== '/dashboard/contact-book') clearContactBookFilters()
  }, [pathname])
  const router = useRouter()
  const { data: openExams } = useDigitalExams(status === 'authenticated' && session?.user?.role === 'STUDENT')
  // Same request as the reminder banner, so the Attendance count costs nothing extra.
  const { data: attendanceReminders } = useSundaySchoolAttendanceReminders(
    status === 'authenticated' && pathname.startsWith('/dashboard/servants') ? session?.user?.id : undefined
  )
  const attendanceDue = attendanceReminders?.reminders.length ?? 0
  const [rail, setRail] = useState(false)

  useEffect(() => {
    try {
      setRail(window.localStorage.getItem(RAIL_KEY) === '1')
    } catch {
      // Storage can be unavailable (private mode); the sidebar just starts open.
    }
  }, [])

  const toggleRail = useCallback(() => {
    setRail((current) => {
      const next = !current
      try {
        window.localStorage.setItem(RAIL_KEY, next ? '1' : '0')
      } catch {
        // Not persisted; fine.
      }
      return next
    })
  }, [])

  const [ministryContext, setMinistryContext] = useState<{ userId: string; ministry: Ministry } | null>(null)
  const user = session?.user
  const ministries = useMemo(() => (user ? availableMinistries(user) : []), [user])

  // Shared pages such as Daily readings retain the ministry and class context.
  // Scope the preference to this account, including when switching View as.
  useEffect(() => {
    if (!user) return
    const storageKey = `active-ministry:${user.id}`
    let preferred: Ministry | undefined
    try {
      const saved = window.sessionStorage.getItem(storageKey)
      if (saved === 'prep' || saved === 'sunday-school') preferred = saved
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
    const ministry = resolveMinistry(user, pathname, preferred)
    setMinistryContext(previous => previous?.userId === user.id && previous.ministry === ministry
      ? previous : { userId: user.id, ministry })
    try { window.sessionStorage.setItem(storageKey, ministry) } catch { /* Storage is optional. */ }
  }, [user, pathname])

  // Command+1–9 on macOS, Ctrl+1–9 elsewhere, switch ministries in menu order.
  useEffect(() => {
    if (ministries.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return
      const index = Number(e.key) - 1
      if (!Number.isInteger(index) || index < 0 || index >= ministries.length) return
      e.preventDefault()
      router.push(ministries[index].href)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ministries, router])

  if (!usesAppShell(pathname) || status === 'unauthenticated') {
    return <>{children}</>
  }

  if (!user) {
    // Session still loading: hold the frame so the page doesn't jump when it arrives.
    return (
      <div className="flex min-h-dvh">
        <div data-sidebar className="hidden shrink-0 border-r border-line bg-sidebar-bg md:block" />
        <main id="main" className="min-w-0 flex-1"><PageLoading /></main>
      </div>
    )
  }

  const ministry = resolveMinistry(user, pathname, ministryContext?.userId === user.id ? ministryContext.ministry : undefined)
  const groups = navigationFor(user, ministry).map(group => ({
    ...group,
    items: group.items
      .filter(item => item.href !== '/dashboard/student/exams' || !!openExams?.exams.length)
      .map(item => (item.href === '/dashboard/servants/attendance' && attendanceDue ? { ...item, badge: attendanceDue } : item)),
  }))
  const page = currentNavLabel(groups, pathname)
  const roleLabel = `${getRoleDisplayName(user.role)}${user.isAsyncStudent ? ' · Async' : ''}`
  const shellUser = { name: user.name, role: user.role, roleLabel, imageUrl: user.profileImageUrl ?? user.image }
  const homeHref = ministry === 'sunday-school' ? (user.role === 'PARENT' ? '/dashboard/parent' : '/dashboard/servants') : prepHome(user.role)
  const showYear = ministry === 'prep' && user.role !== 'PARENT'
  // Keep Sunday School class context visible on shared pages within this ministry.
  const viewing = ministry === 'sunday-school' && user.role !== 'PARENT'

  return (
    // Browser tabs scroll the document so Safari can collapse its toolbar.
    // CSS keeps the fixed-height, internally scrolling layout for Home Screen apps.
    <div data-ministry={ministry} className="app-shell flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <Sidebar
        ministry={ministry}
        ministries={ministries}
        groups={groups}
        pathname={pathname}
        search=""
        user={shellUser}
        rail={rail}
        viewing={viewing}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileAppBar ministry={ministry} ministries={ministries} viewing={viewing} />
        <TopBar
          ministry={ministry}
          homeHref={homeHref}
          page={page}
          onToggleRail={toggleRail}
          railCollapsed={rail}
          showYear={showYear}
          yearHref={isAdmin(user.role) ? '/dashboard/admin/settings' : undefined}
        />
        <main
          id="main"
          className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pt-4 pb-6 md:px-7 md:pt-6 md:pb-7 print:p-0"
        >
          {/* Reminders live inside the content area: anything above the shell makes
              the page taller than the screen and shifts the phone layout. */}
          <AnnualMentorReminderBanner />
          <SundaySchoolAttendanceReminderBanner />
          <ProfilePhotoReminder />
          {children}
        </main>
        <MobileTabBar
          ministry={ministry}
          ministries={ministries}
          groups={groups}
          pathname={pathname}
          search=""
          user={shellUser}
        />
      </div>
    </div>
  )
}
