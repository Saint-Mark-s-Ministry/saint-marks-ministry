'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  getRoleDisplayName,
  canManageAllUsers,
  canManageEnrollments,
  canViewRegistrations,
  isAdmin,
  canAdministerSundaySchool,
  canReviewServantApplications,
} from '@/lib/roles'
import { Menu, X, Moon, Sun, ChevronDown, Search } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { getPersonInitials } from '@/lib/person-name'
import { cn } from '@/lib/utils'

interface NavLink {
  href: string
  label: string
}

export function Navbar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [switchingModes, setSwitchingModes] = useState(false)
  const [isScrollCompact, setIsScrollCompact] = useState(false)
  const [isMobileNavHidden, setIsMobileNavHidden] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const lastScrollY = useRef(0)
  const mobileScrollDistance = useRef(0)
  const scrollFrame = useRef<number | null>(null)

  useEffect(() => {
    const mobileViewport = window.matchMedia?.('(max-width: 1023px)')
    const isMobileViewport = () => mobileViewport?.matches ?? window.innerWidth <= 1023
    lastScrollY.current = window.scrollY
    setIsAtTop(window.scrollY <= 20)
    if (isMobileViewport()) {
      setIsScrollCompact(false)
    } else {
      setIsMobileNavHidden(false)
    }

    const syncResponsiveState = () => {
      mobileScrollDistance.current = 0
      if (isMobileViewport()) {
        setIsScrollCompact(false)
      } else {
        setIsMobileNavHidden(false)
      }
    }

    const handleScroll = () => {
      if (scrollFrame.current !== null) return

      scrollFrame.current = window.requestAnimationFrame(() => {
        const currentScrollY = Math.max(0, window.scrollY)
        const delta = currentScrollY - lastScrollY.current
        setIsAtTop(currentScrollY <= 20)

        if (currentScrollY <= 20) {
          setIsScrollCompact(false)
          setIsMobileNavHidden(false)
          mobileScrollDistance.current = 0
        } else if (isMobileViewport()) {
          setIsScrollCompact(false)

          if (delta > 0) {
            mobileScrollDistance.current = Math.max(0, mobileScrollDistance.current) + delta
            if (currentScrollY > 96 && mobileScrollDistance.current >= 40) {
              setIsMobileNavHidden(true)
              mobileScrollDistance.current = 0
            }
          } else if (delta < 0) {
            mobileScrollDistance.current = Math.min(0, mobileScrollDistance.current) + delta
            if (mobileScrollDistance.current <= -18) {
              setIsMobileNavHidden(false)
              mobileScrollDistance.current = 0
            }
          }
        } else if (delta > 6) {
          setIsMobileNavHidden(false)
          setIsScrollCompact(true)
        } else if (delta < -6) {
          setIsMobileNavHidden(false)
          setIsScrollCompact(false)
        }

        lastScrollY.current = currentScrollY
        scrollFrame.current = null
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    mobileViewport?.addEventListener('change', syncResponsiveState)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      mobileViewport?.removeEventListener('change', syncResponsiveState)
      if (scrollFrame.current !== null) window.cancelAnimationFrame(scrollFrame.current)
    }
  }, [])

  const navOverlayOpen = mobileMenuOpen || profileMenuOpen || notificationsOpen

  useEffect(() => {
    if (!navOverlayOpen) return
    setIsMobileNavHidden(false)
    mobileScrollDistance.current = 0
  }, [navOverlayOpen])

  if (
    !session?.user ||
    pathname === '/login' ||
    pathname === '/change-password'
  ) {
    return null
  }

  const userInitials = getPersonInitials(session.user.name)
  const showIdentityText = (session.user.name?.trim().length ?? 0) <= 24

  const isActive = (path: string) => {
    // Exact match for the path
    if (pathname === path) return true

    // For sub-routes, check if pathname starts with path + '/'
    // but exclude the base dashboard path to prevent it from always being active
    if (
      path === '/dashboard/admin' ||
      path === '/dashboard/mentor' ||
      path === '/dashboard/student' ||
      path === '/dashboard/servants'
    ) {
      return pathname === path
    }

    return pathname.startsWith(path + '/')
  }

  // The app has two modes: the Servants Prep program and Sunday School.
  // Which one is showing is derived from the path — no extra state.
  const inSundaySchoolMode = pathname.startsWith('/dashboard/servants')
  // Sunday School access comes from assignments, not a role, so this reads the
  // standing the session carries. Someone with a foot in both modes — a prep
  // leader or mentor who also serves — gets the service chooser in the profile
  // menu; a SERVANT has only one mode.
  const hasSundaySchool = session.user.sundaySchool?.hasAccess ?? false
  const prepModeDestination =
    session.user.role === 'MENTOR' ? '/dashboard/mentor' : '/dashboard/admin'
  const canSwitchModes =
    hasSundaySchool && (isAdmin(session.user.role) || session.user.role === 'MENTOR')
  const modeDestination = inSundaySchoolMode
    ? prepModeDestination
    : '/dashboard/servants'
  const dashboardDestination = inSundaySchoolMode ? '/dashboard/servants' : '/dashboard'
  const accountDestination = inSundaySchoolMode ? '/dashboard/servants/account' : '/settings'
  const serviceOptions = [
    {
      name: 'Servants Prep',
      href: prepModeDestination,
      logo: '/sp-logo.png',
      logoClassName: 'rounded-md bg-black p-1',
      active: !inSundaySchoolMode,
    },
    {
      name: 'Sunday School',
      href: '/dashboard/servants',
      logo: '/sunday-school-favicon.png',
      logoClassName: '',
      active: inSundaySchoolMode,
    },
  ]
  const serviceRowClassName = 'mx-1 flex h-16 shrink-0 items-center gap-3 rounded-md px-2 py-2'

  const handleModeSwitch = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (switchingModes) return

    setMobileMenuOpen(false)

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (prefersReducedMotion) {
      router.push(modeDestination)
      return
    }

    setSwitchingModes(true)
    document.documentElement.dataset.modeTransition = inSundaySchoolMode
      ? 'to-servants-prep'
      : 'to-sunday-school'

    const waitForModeRoute = () =>
      new Promise<void>((resolve) => {
        const startedAt = performance.now()

        const waitForRoute = () => {
          if (window.location.pathname === modeDestination || performance.now() - startedAt > 2000) {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            return
          }

          requestAnimationFrame(waitForRoute)
        }

        waitForRoute()
      })

    const cleanUpTransition = () => {
      delete document.documentElement.dataset.modeTransition
      document.documentElement.classList.remove('mode-transition-fallback-out')
      document.documentElement.classList.remove('mode-transition-fallback-in')
      setSwitchingModes(false)
    }

    document.documentElement.classList.add('mode-transition-fallback-out')

    window.setTimeout(() => {
      router.push(modeDestination)

      void waitForModeRoute().then(() => {
        document.documentElement.classList.remove('mode-transition-fallback-out')
        document.documentElement.classList.add('mode-transition-fallback-in')
        window.setTimeout(cleanUpTransition, 220)
      })
    }, 160)
  }

  // Navigation links based on role
  // Returns { primary, more } for admin roles, or just { primary } for others
  const getNavLinks = (): { primary: NavLink[]; more: NavLink[] } => {
    const role = session.user.role

    if (role === 'STUDENT') {
      const links: NavLink[] = [
        { href: '/dashboard/student', label: 'My Progress' },
        { href: '/dashboard/student/lessons', label: 'My Lessons' },
        { href: '/dashboard/student/class-lessons', label: 'Class Lessons' },
        { href: '/dashboard/files', label: 'Files' },
      ]
      if (session.user.isAsyncStudent) {
        links.push({ href: '/dashboard/student/attendance-slip', label: 'Attendance Slip' })
        links.push({ href: '/dashboard/student/sunday-school', label: 'Sunday School' })
      }
      return { primary: links, more: [] }
    }

    if (role === 'MENTOR' && !inSundaySchoolMode) {
      return {
        primary: [
          { href: '/dashboard/mentor', label: 'Dashboard' },
          { href: '/dashboard/mentor/my-mentees', label: 'My Mentees' },
          { href: '/dashboard/files', label: 'Files' },
        ],
        more: []
      }
    }

    if (role === 'SERVANT') {
      const servantMore: NavLink[] = [
        { href: '/dashboard/servants/visitations', label: 'Visitations' },
        { href: '/dashboard/servants/classes', label: 'Classes' },
        { href: '/dashboard/servants/feedback', label: 'Feedback' },
      ]
      if (hasSundaySchool) {
        servantMore.unshift({ href: '/dashboard/servants/servant-attendance', label: 'Servant attendance' })
      }
      return {
        primary: [
          { href: '/dashboard/servants', label: 'Dashboard' },
          { href: '/dashboard/servants/lessons', label: 'Lessons' },
          { href: '/dashboard/servants/attendance', label: 'Attendance' },
          { href: '/dashboard/servants/roster', label: 'Roster' },
        ],
        more: servantMore,
      }
    }

    // Anyone browsing Sunday School mode gets that mode's links; the service
    // chooser in the profile menu takes those with both back to prep.
    if (inSundaySchoolMode && hasSundaySchool) {
      const links: NavLink[] = [
        { href: '/dashboard/servants', label: 'Dashboard' },
        { href: '/dashboard/servants/lessons', label: 'Lessons' },
        { href: '/dashboard/servants/attendance', label: 'Attendance' },
        { href: '/dashboard/servants/roster', label: 'Roster' },
      ]
      const more: NavLink[] = [
        { href: '/dashboard/servants/visitations', label: 'Visitations' },
        { href: '/dashboard/servants/classes', label: 'Classes' },
        { href: '/dashboard/servants/feedback', label: 'Feedback' },
      ]

      more.unshift({ href: '/dashboard/servants/servant-attendance', label: 'Servant attendance' })

      if (canReviewServantApplications(role)) {
        more.push({
          href: '/dashboard/servants/servant-applications',
          label: 'Servant applications',
        })
      }

      if (canAdministerSundaySchool(role)) {
        more.push({ href: '/dashboard/servants/users', label: 'Users' })
      }
      if (canManageAllUsers(role)) {
        more.push({ href: '/dashboard/servants/activity', label: 'Activity' })
      }

      return {
        primary: links,
        more,
      }
    }

    // SUPER_ADMIN, PRIEST, SERVANT_PREP — split into primary tabs + "More" dropdown
    const primary: NavLink[] = [
      { href: '/dashboard/admin', label: 'Dashboard' },
      { href: '/dashboard/admin/attendance', label: 'Attendance' },
      { href: '/dashboard/admin/students', label: 'Students' },
      { href: '/dashboard/admin/exams', label: 'Exams' },
    ]

    const more: NavLink[] = [
      { href: '/dashboard/admin/curriculum', label: 'Curriculum' },
      { href: '/dashboard/admin/mentees', label: 'Mentees' },
      { href: '/dashboard/admin/confession', label: 'Confession' },
      { href: '/dashboard/files', label: 'Files' },
    ]

    // Async section
    more.push({ href: '/dashboard/admin/async-students', label: 'Async Students' })

    // Conditional management pages
    if (canManageEnrollments(role)) {
      more.push({ href: '/dashboard/admin/enrollments', label: 'Roster' })
    }
    if (canManageAllUsers(role)) {
      more.push({ href: '/dashboard/admin/users', label: 'Users' })
      more.push({ href: '/dashboard/admin/activity', label: 'Activity' })
    }
    if (canViewRegistrations(role)) {
      more.push({ href: '/dashboard/admin/registrations', label: 'Registrations' })
    }

    return { primary, more }
  }

  const { primary: primaryLinks, more: moreLinks } = getNavLinks()
  const allLinks = [...primaryLinks, ...moreLinks]
  const isMoreActive = moreLinks.some(link => isActive(link.href))
  const navCondensed = isScrollCompact && !mobileMenuOpen
  const mobileNavHidden = isMobileNavHidden && !navOverlayOpen

  return (
    <nav
      data-scroll-state={navCondensed ? 'compact' : 'expanded'}
      data-page-position={isAtTop ? 'top' : 'scrolled'}
      data-mobile-visibility={mobileNavHidden ? 'hidden' : 'visible'}
      className={cn(
        'sticky top-0 z-50 h-20 w-full min-w-0 translate-y-0 transform-gpu px-2 pt-2 opacity-100 will-change-[translate,opacity] transition-[translate,opacity,background-color] motion-reduce:transition-none sm:h-[88px] sm:px-4 sm:pt-3',
        mobileNavHidden
          ? '-translate-y-[calc(100%+1rem)] pointer-events-none opacity-0 duration-[520ms] ease-[cubic-bezier(0.4,0,0.2,1)] lg:translate-y-0 lg:pointer-events-auto lg:opacity-100'
          : 'translate-y-0 opacity-100 duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        isAtTop ? 'bg-[var(--app-canvas)]' : 'bg-[var(--app-canvas)] lg:bg-transparent'
      )}
    >
      <div
        className={cn(
          'mx-auto w-full min-w-0 rounded-2xl border border-gray-200/80 bg-white/90 shadow-lg shadow-gray-900/8 backdrop-blur-xl transition-[max-width,transform,box-shadow,background-color,border-color] duration-300 ease-out motion-reduce:transition-none dark:border-gray-700/80 dark:bg-gray-900/90 dark:shadow-black/30',
          navCondensed
            ? 'max-w-6xl -translate-y-1 shadow-xl shadow-gray-900/12 dark:shadow-black/40'
            : 'max-w-7xl translate-y-0'
        )}
      >
        <div className="px-3 sm:px-5 lg:px-6">
        <div
          className={cn(
            'flex items-center justify-between gap-2 transition-[height] duration-300 ease-out motion-reduce:transition-none',
            navCondensed ? 'h-14' : 'h-16'
          )}
        >
          {/* Left side - Logo/Title */}
          <div className="flex min-w-0 flex-1 items-center gap-8 overflow-hidden">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                href={inSundaySchoolMode ? '/dashboard/servants' : '/dashboard'}
                className="flex min-w-0 items-center gap-2 sm:shrink-0 sm:gap-3"
              >
                <span className="flex h-9 w-10 shrink-0 items-center justify-center sm:h-10 sm:w-12">
                  <Image
                    src={inSundaySchoolMode ? '/sunday-school-favicon.png' : '/sp-logo.png'}
                    alt={inSundaySchoolMode ? 'St. Mark Coptic Orthodox Church Logo' : 'Servants Prep Logo'}
                    width={inSundaySchoolMode ? 48 : 40}
                    height={40}
                    className={inSundaySchoolMode
                      ? 'h-9 w-9 object-contain sm:h-11 sm:w-11'
                      : 'h-9 w-9 rounded-md bg-black p-1 sm:h-10 sm:w-10'}
                  />
                </span>
                <span className="truncate whitespace-nowrap text-base font-bold text-gray-900 sm:text-xl dark:text-white">
                  {inSundaySchoolMode ? 'Sunday School' : 'Servants Prep'}
                </span>
              </Link>

            </div>

            {/* Navigation Links */}
            <div className="hidden w-[440px] shrink-0 items-center gap-1 xl:flex">
              {primaryLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'bg-maroon-50 text-maroon-700 dark:bg-maroon-900/30 dark:text-maroon-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {/* "More" dropdown for admin roles */}
              {moreLinks.length > 0 && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={`inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isMoreActive
                          ? 'bg-maroon-50 text-maroon-700 dark:bg-maroon-900/30 dark:text-maroon-300'
                          : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                      }`}
                    >
                      More
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {moreLinks.map((link, index) => {
                      // Add separator before "Async Students" and before "Roster" (or "Users" if no Roster)
                      const needsSeparator =
                        link.href === '/dashboard/admin/async-students' ||
                        link.href === '/dashboard/admin/enrollments' ||
                        (link.href === '/dashboard/admin/users' && !canManageEnrollments(session.user.role))

                      return (
                        <div key={link.href}>
                          {needsSeparator && index > 0 && <DropdownMenuSeparator />}
                          <DropdownMenuItem asChild>
                            <Link
                              href={link.href}
                              className={`cursor-pointer w-full ${
                                isActive(link.href)
                                  ? 'bg-maroon-50 text-maroon-700 dark:bg-maroon-900/30 dark:text-maroon-300'
                                  : ''
                              }`}
                            >
                              {link.label}
                            </Link>
                          </DropdownMenuItem>
                        </div>
                      )
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Right side - User menu */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            {/* Search / command palette trigger - desktop (search-bar style) */}
            <button
              type="button"
              aria-label="Open command palette"
              onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
              className={cn(
                'hidden h-10 items-center rounded-lg border bg-gray-50 text-sm text-gray-500 transition-all duration-300 hover:border-gray-300 hover:bg-white hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-500 md:inline-flex dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800',
                navCondensed
                  ? 'w-10 justify-center px-0'
                  : 'w-56 gap-2 px-3 lg:w-48 xl:w-56 2xl:w-64'
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!navCondensed && (
                <>
                  <span className="flex-1 text-left truncate">Search students, lessons…</span>
                  <kbd className="hidden lg:inline-flex h-5 items-center rounded border bg-white dark:bg-gray-900 dark:border-gray-700 px-1.5 font-mono text-[10px] text-gray-500">⌘K</kbd>
                </>
              )}
            </button>

            {/* Search trigger - mobile icon only */}
            <button
              type="button"
              aria-label="Open command palette"
              onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Notification bell */}
            <NotificationBell onOpenChange={setNotificationsOpen} />

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              className="relative overflow-hidden xl:hidden"
              size="icon"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-menu"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <Menu
                className={cn(
                  'absolute h-6 w-6 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
                  mobileMenuOpen ? 'rotate-90 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'
                )}
              />
              <X
                className={cn(
                  'absolute h-6 w-6 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
                  mobileMenuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-75 opacity-0'
                )}
              />
            </Button>

            <div className={showIdentityText && !navCondensed ? 'hidden min-w-0 max-w-40 shrink flex-col items-end 2xl:flex' : 'hidden'}>
              <span
                className="max-w-full truncate text-sm font-medium text-gray-900 dark:text-white"
                title={session.user.name ?? undefined}
              >
                {session.user.name}
              </span>
              <span className="max-w-full truncate text-xs text-gray-600 dark:text-gray-400">
                {getRoleDisplayName(session.user.role)}
              </span>
            </div>

            <DropdownMenu
              open={profileMenuOpen}
              onOpenChange={setProfileMenuOpen}
              modal={false}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="relative h-10 w-10 rounded-full"
                  aria-label="Open profile menu"
                >
                  <Avatar className="h-10 w-10">
                    {session.user.profileImageUrl && (
                      <AvatarImage src={session.user.profileImageUrl} alt={session.user.name || ''} />
                    )}
                    <AvatarFallback className="bg-maroon-600 text-xs font-semibold tracking-tight text-white">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="flex flex-col space-y-1 p-2">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="text-xs text-muted-foreground">{session.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {getRoleDisplayName(session.user.role)}
                  </p>
                </div>
                {canSwitchModes && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 pb-1 pt-1 text-xs font-medium text-muted-foreground">
                      Services
                    </div>
                    <div className="space-y-1">
                      {serviceOptions.map((service) =>
                        service.active ? (
                          <div
                            key={service.name}
                            data-service-option
                            aria-current="page"
                            className={`${serviceRowClassName} bg-accent/60`}
                          >
                            <Image
                              src={service.logo}
                              alt={`${service.name} logo`}
                              width={32}
                              height={32}
                              className={`h-8 w-8 object-contain ${service.logoClassName}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {service.name}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                Current service
                              </span>
                            </span>
                          </div>
                        ) : (
                          <DropdownMenuItem
                            key={service.name}
                            asChild
                            data-service-option
                            className={`${serviceRowClassName} focus:bg-accent/60`}
                          >
                            <Link
                              href={service.href}
                              onClick={handleModeSwitch}
                              data-mode-switch
                              aria-disabled={switchingModes}
                              aria-label={`Switch to ${service.name}`}
                              className={switchingModes ? 'pointer-events-none' : 'cursor-pointer'}
                            >
                              <Image
                                src={service.logo}
                                alt={`${service.name} logo`}
                                width={32}
                                height={32}
                                className={`h-8 w-8 object-contain ${service.logoClassName}`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">{service.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                  Switch service
                                </span>
                              </span>
                            </Link>
                          </DropdownMenuItem>
                        )
                      )}
                    </div>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={dashboardDestination} className="cursor-pointer">
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={accountDestination} className="cursor-pointer">
                    My Account
                  </Link>
                </DropdownMenuItem>
                {!inSundaySchoolMode && (session.user.role === 'SUPER_ADMIN' || session.user.role === 'PRIEST' || session.user.role === 'SERVANT_PREP') && (
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/admin/settings" className="cursor-pointer">
                      Settings
                    </Link>
                  </DropdownMenuItem>
                )}
                {!inSundaySchoolMode && (
                  <DropdownMenuItem asChild>
                    <Link href="/change-password" className="cursor-pointer">
                      Change Password
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link
                    href={inSundaySchoolMode ? '/dashboard/servants/privacy' : '/privacy'}
                    className="cursor-pointer"
                  >
                    Privacy Policy
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={inSundaySchoolMode ? '/dashboard/servants/terms' : '/terms'}
                    className="cursor-pointer"
                  >
                    Terms of Service
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer flex items-center gap-2"
                  onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
                >
                  {resolvedTheme === 'dark' ? (
                    <>
                      <Sun className="h-4 w-4" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4" />
                      Dark Mode
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                >
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile menu - flat list of all links */}
        <div
          id="mobile-navigation-menu"
          aria-hidden={!mobileMenuOpen}
          className={cn(
            'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none xl:hidden',
            mobileMenuOpen
              ? 'visible grid-rows-[1fr] opacity-100 pointer-events-auto'
              : 'invisible grid-rows-[0fr] opacity-0 pointer-events-none'
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mx-1 mb-2 max-h-[calc(100dvh-7rem)] space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-gray-200/70 bg-gray-50/75 px-2 pb-3 pt-2 shadow-inner dark:border-gray-700/70 dark:bg-gray-800/65">
              {allLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium transition-colors ${
                    isActive(link.href)
                      ? 'bg-maroon-50 text-maroon-700 dark:bg-maroon-900/30 dark:text-maroon-300'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </nav>
  )
}
