'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Command } from 'cmdk'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import {
  Search,
  LayoutDashboard,
  ClipboardCheck,
  GraduationCap,
  BookOpen,
  Cake,
  Users,
  UserCheck,
  FileText,
  Settings,
  FolderOpen,
  School,
  NotebookPen,
  X,
} from 'lucide-react'
import { isAdmin, canManageAllUsers, canManageEnrollments, canAdministerSundaySchool, canViewRegistrations } from '@/lib/roles'
import type { UserRole } from '@prisma/client'
import { useShortcutModifier } from '@/hooks/useShortcutModifier'

interface SearchUser {
  id: string
  name: string
  email: string
  role: UserRole
}

interface SearchLesson {
  id: string
  title: string
  scheduledDate: string
  lessonNumber: number
}

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

function getNavItemsForRole(
  role: UserRole,
  hasSundaySchool: boolean,
  inSundaySchoolMode: boolean,
  hasHomeworkAccess: boolean,
): NavItem[] {
  if (inSundaySchoolMode && hasSundaySchool) {
    const items: NavItem[] = [
      { label: 'Sunday School Dashboard', href: '/dashboard/servants', icon: LayoutDashboard },
      { label: 'Sunday School Lessons', href: '/dashboard/servants/lessons', icon: BookOpen },
      { label: 'Take Attendance', href: '/dashboard/servants/attendance', icon: ClipboardCheck },
      { label: 'Roster', href: '/dashboard/servants/roster', icon: Users },
      { label: 'Children\'s Birthdays', href: '/dashboard/servants/birthdays', icon: Cake },
      { label: 'Classes', href: '/dashboard/servants/classes', icon: BookOpen },
    ]

    if (hasHomeworkAccess) {
      items.splice(2, 0, { label: 'Elementary Homework', href: '/dashboard/servants/homework', icon: NotebookPen })
    }

    if (canAdministerSundaySchool(role)) {
      items.push({ label: 'Users', href: '/dashboard/servants/users', icon: Users })
    }

    items.push({ label: 'My Account', href: '/dashboard/servants/account', icon: Settings })
    return items
  }

  if (role === 'STUDENT') {
    return [
      { label: 'My Progress', href: '/dashboard/student', icon: LayoutDashboard },
      { label: 'My Lessons', href: '/dashboard/student/lessons', icon: BookOpen },
      { label: 'Exam answer sheets', href: '/dashboard/student/exams', icon: GraduationCap },
      { label: 'Makeup Exams', href: '/dashboard/student/makeup-exams', icon: GraduationCap },
      { label: 'Class Lessons', href: '/dashboard/student/class-lessons', icon: School },
      { label: 'Files', href: '/dashboard/files', icon: FolderOpen },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  }

  if (role === 'MENTOR') {
    return [
      { label: 'Mentor Dashboard', href: '/dashboard/mentor', icon: LayoutDashboard },
      { label: 'My Mentees', href: '/dashboard/mentor/my-mentees', icon: Users },
      { label: 'Files', href: '/dashboard/files', icon: FolderOpen },
      { label: 'Settings', href: '/settings', icon: Settings },
    ]
  }

  if (role === 'SERVANT') {
    return [
      { label: 'Sunday School Dashboard', href: '/dashboard/servants', icon: LayoutDashboard },
      { label: 'Sunday School Lessons', href: '/dashboard/servants/lessons', icon: BookOpen },
      { label: 'Take Attendance', href: '/dashboard/servants/attendance', icon: ClipboardCheck },
      { label: 'Roster', href: '/dashboard/servants/roster', icon: Users },
      { label: 'Children\'s Birthdays', href: '/dashboard/servants/birthdays', icon: Cake },
      { label: 'Classes', href: '/dashboard/servants/classes', icon: BookOpen },
      { label: 'My Account', href: '/dashboard/servants/account', icon: Settings },
    ]
  }

  const items: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
    { label: 'Attendance', href: '/dashboard/admin/attendance', icon: ClipboardCheck },
    { label: 'Students', href: '/dashboard/admin/students', icon: Users },
    { label: 'Exams', href: '/dashboard/admin/exams', icon: GraduationCap },
    { label: 'Curriculum', href: '/dashboard/admin/curriculum', icon: BookOpen },
    { label: 'Mentees', href: '/dashboard/admin/mentees', icon: UserCheck },
    { label: 'Confession', href: '/dashboard/admin/confession', icon: FileText },
    { label: 'Async Students', href: '/dashboard/admin/async-students', icon: FileText },
    { label: 'Files', href: '/dashboard/files', icon: FolderOpen },
  ]
  if (canManageEnrollments(role)) {
    items.push({ label: 'Roster', href: '/dashboard/admin/enrollments', icon: Users })
  }
  if (canManageAllUsers(role)) {
    items.push({ label: 'Users', href: '/dashboard/admin/users', icon: Users })
  }
  if (canViewRegistrations(role)) {
    items.push({ label: 'Registrations', href: '/dashboard/admin/registrations', icon: FileText })
  }
  if (hasSundaySchool) {
    items.push({ label: 'Sunday School', href: '/dashboard/servants', icon: School })
    items.push({ label: 'Sunday School Attendance', href: '/dashboard/servants/attendance', icon: ClipboardCheck })
  }
  items.push({ label: 'Settings', href: '/dashboard/admin/settings', icon: Settings })
  return items
}

export function CommandPalette() {
  const shortcutModifier = useShortcutModifier()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<SearchUser[]>([])
  const [lessons, setLessons] = useState<SearchLesson[]>([])
  const [loading, setLoading] = useState(false)
  const { data: session } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  // Global Cmd/Ctrl+K shortcut + custom "open-command-palette" event
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpen)
    }
  }, [])

  // Close on navigation
  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [pathname])

  // Lazy fetch students + lessons when query is non-empty
  useEffect(() => {
    const role = session?.user?.role
    if (!open || !query.trim() || !role) {
      setStudents([])
      setLessons([])
      return
    }

    const canSearchStudents = isAdmin(role) || role === 'MENTOR'
    if (!canSearchStudents && role !== 'STUDENT') return

    const controller = new AbortController()
    const trimmed = query.trim()

    const fetchData = async () => {
      setLoading(true)
      try {
        const requests: Promise<Response>[] = []
        if (canSearchStudents) {
          requests.push(
            fetch(`/api/users?role=STUDENT&search=${encodeURIComponent(trimmed)}&limit=8`, {
              signal: controller.signal,
            })
          )
          requests.push(
            fetch(`/api/lessons?search=${encodeURIComponent(trimmed)}&limit=8`, {
              signal: controller.signal,
            })
          )
        }

        const responses = await Promise.allSettled(requests)
        if (canSearchStudents && responses[0]?.status === 'fulfilled') {
          const res = responses[0].value
          if (res.ok) {
            const data = await res.json()
            const list = Array.isArray(data) ? data : data.users || data.data || []
            setStudents(list.slice(0, 8))
          }
        }
        if (canSearchStudents && responses[1]?.status === 'fulfilled') {
          const res = responses[1].value
          if (res.ok) {
            const data = await res.json()
            const list = Array.isArray(data) ? data : data.lessons || data.data || []
            setLessons(list.slice(0, 8))
          }
        }
      } catch {
        // ignored
      } finally {
        setLoading(false)
      }
    }

    const t = setTimeout(fetchData, 200)
    return () => {
      clearTimeout(t)
      controller.abort()
    }
  }, [query, open, session?.user?.role])

  const go = useCallback(
    (href: string) => {
      setOpen(false)
      setQuery('')
      router.push(href)
    },
    [router]
  )

  if (!session?.user) return null

  const navItems = getNavItemsForRole(
    session.user.role,
    session.user.sundaySchool?.hasAccess ?? false,
    pathname.startsWith('/dashboard/servants'),
    session.user.sundaySchool?.hasHomeworkAccess ?? false,
  )
  const role = session.user.role
  const canSearchStudents = isAdmin(role) || role === 'MENTOR'
  const studentHref = (id: string) =>
    role === 'MENTOR'
      ? `/dashboard/mentor/my-mentees?student=${id}`
      : `/dashboard/admin/students?student=${id}`
  const lessonHref = (id: string) =>
    isAdmin(role) ? `/dashboard/admin/curriculum?lesson=${id}` : '/dashboard/student/lessons'

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-slot="dialog-overlay"
          className={cn(
            'fixed inset-0 z-50 bg-black/40 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <DialogPrimitive.Content
          data-slot="top-dialog-content"
          className={cn(
            'fixed left-1/2 z-50 w-full -translate-x-1/2 px-3 sm:px-4',
            // Mobile: near top, almost full width. Desktop: 15% from top, capped width.
            'top-3 sm:top-[12%] max-w-[640px]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search and navigate the app
          </DialogPrimitive.Description>
          <Command
            className="overflow-hidden rounded-xl border bg-white dark:bg-gray-900 shadow-2xl"
            shouldFilter={!query.trim()}
            label="Command Palette"
          >
            <div className="flex items-center gap-2 border-b px-3 dark:border-gray-800">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder={
                  canSearchStudents
                    ? 'Search students, lessons, pages…'
                    : 'Jump to a page…'
                }
                className="h-12 sm:h-14 flex-1 bg-transparent text-base sm:text-sm outline-none placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
              />
              <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-gray-50 dark:bg-gray-800 dark:border-gray-700 px-1.5 text-[10px] font-mono text-gray-500">
                ESC
              </kbd>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="sm:hidden inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <Command.List className="max-h-[70vh] sm:max-h-[60vh] overflow-y-auto overscroll-contain p-2">
              <Command.Empty className="py-6 text-center text-sm text-gray-500">
                {loading ? 'Searching…' : 'No results found.'}
              </Command.Empty>

              {students.length > 0 && (
                <Command.Group heading="Students" className="text-xs font-semibold text-gray-500 uppercase tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                  {students.map(s => (
                    <Command.Item
                      key={`student-${s.id}`}
                      value={`student ${s.name} ${s.email}`}
                      onSelect={() => go(studentHref(s.id))}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 sm:py-2 text-sm cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
                    >
                      <Users className="h-4 w-4 text-gray-500" />
                      <span className="flex-1 truncate">{s.name}</span>
                      <span className="text-xs text-gray-400 truncate max-w-[180px]">{s.email}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {lessons.length > 0 && (
                <Command.Group heading="Lessons" className="text-xs font-semibold text-gray-500 uppercase tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                  {lessons.map(l => (
                    <Command.Item
                      key={`lesson-${l.id}`}
                      value={`lesson ${l.title}`}
                      onSelect={() => go(lessonHref(l.id))}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 sm:py-2 text-sm cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
                    >
                      <BookOpen className="h-4 w-4 text-gray-500" />
                      <span className="flex-1 truncate">
                        #{l.lessonNumber} · {l.title}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(l.scheduledDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Navigate" className="text-xs font-semibold text-gray-500 uppercase tracking-wide [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1">
                {navItems.map(item => {
                  const Icon = item.icon
                  return (
                    <Command.Item
                      key={item.href}
                      value={`nav ${item.label}`}
                      onSelect={() => go(item.href)}
                      className="flex items-center gap-3 rounded-md px-2 py-2.5 sm:py-2 text-sm cursor-pointer aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800"
                    >
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span>{item.label}</span>
                    </Command.Item>
                  )
                })}
              </Command.Group>
            </Command.List>

            <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-gray-500">
              <span>
                <kbd className="rounded border bg-gray-50 dark:bg-gray-800 px-1 font-mono">↑↓</kbd> navigate
                {'  '}
                <kbd className="rounded border bg-gray-50 dark:bg-gray-800 px-1 font-mono">↵</kbd> select
              </span>
              {shortcutModifier && (
                <span className="hidden md:inline">
                  <kbd className="rounded border bg-gray-50 dark:bg-gray-800 px-1 font-mono">{shortcutModifier}K</kbd> to toggle
                </span>
              )}
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
