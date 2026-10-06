import type { UserRole } from '@prisma/client'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BookOpen,
  Cake,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cross,
  FileText,
  Folder,
  GraduationCap,
  HandHeart,
  Home,
  Inbox,
  Layers,
  NotebookPen,
  MessageSquare,
  Presentation,
  School,
  Settings,
  SlidersHorizontal,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  canAdministerSundaySchool,
  canManageAllUsers,
  canManageEnrollments,
  canReviewServantApplications,
  canViewRegistrations,
  isAdmin,
} from '@/lib/roles'

/**
 * The app shell's navigation, by ministry and role.
 *
 * The sidebar, the phone tab bar and its "More" sheet all read from this, so
 * every destination is one click away on desktop and the same list appears on
 * phones. This only decides what links to show — every page still guards
 * itself, and Sunday School authority is re-derived on the server.
 */

export type Ministry = 'prep' | 'sunday-school'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Shown as one of the phone tab bar's four slots. */
  tab?: boolean
  /** Short label for the tab bar, when the full one is too long. */
  tabLabel?: string
}

export interface NavGroup {
  /** Uppercase group heading; the first group has none. */
  label?: string
  items: NavItem[]
}

export interface NavUser {
  role: UserRole
  isAsyncStudent?: boolean
  sundaySchool?: { hasAccess: boolean; isCoordinator: boolean; hasHomeworkAccess?: boolean } | null
}

export interface MinistryOption {
  id: Ministry
  name: string
  href: string
}

export function ministryForPath(pathname: string): Ministry {
  return pathname === '/dashboard/servants' ||
    pathname.startsWith('/dashboard/servants/') ||
    pathname === '/dashboard/parent'
    ? 'sunday-school'
    : 'prep'
}

export const MINISTRY_NAMES: Record<Ministry, string> = {
  prep: 'Servants Prep',
  'sunday-school': 'Sunday School',
}

/** Where someone lands in the prep program; mentors have their own dashboard. */
export function prepHome(role: UserRole): string {
  if (role === 'MENTOR') return '/dashboard/mentor'
  if (role === 'STUDENT') return '/dashboard/student'
  if (role === 'PARENT') return '/dashboard/parent'
  return '/dashboard/admin'
}

/**
 * The ministries this person can open, in switcher order. With one, the
 * switcher becomes a plain label. Prep leaders and mentors who also serve
 * Sunday School get both; a SERVANT and a PARENT have only one.
 */
export function availableMinistries(user: NavUser): MinistryOption[] {
  const hasSundaySchool = user.sundaySchool?.hasAccess ?? false
  if (user.role === 'SERVANT') {
    return [{ id: 'sunday-school', name: MINISTRY_NAMES['sunday-school'], href: '/dashboard/servants' }]
  }
  const prep: MinistryOption = { id: 'prep', name: MINISTRY_NAMES.prep, href: prepHome(user.role) }
  if (user.role === 'PARENT') {
    return [{ id: 'sunday-school', name: MINISTRY_NAMES['sunday-school'], href: '/dashboard/parent' }]
  }
  if (hasSundaySchool && (isAdmin(user.role) || user.role === 'MENTOR')) {
    return [prep, { id: 'sunday-school', name: MINISTRY_NAMES['sunday-school'], href: '/dashboard/servants' }]
  }
  return [prep]
}

/**
 * The ministry the shell shows. Someone with one ministry stays in it on
 * shared pages (/settings, /dashboard/files); someone with both follows the path.
 */
export function resolveMinistry(user: NavUser, pathname: string): Ministry {
  const options = availableMinistries(user)
  if (options.length === 1) return options[0].id
  return ministryForPath(pathname)
}

function prepAdminNav(role: UserRole): NavGroup[] {
  const people: NavItem[] = [{ href: '/dashboard/admin/async-students', label: 'Async students', icon: Clock }]
  if (canManageEnrollments(role)) people.push({ href: '/dashboard/admin/enrollments', label: 'Roster', icon: ClipboardList })
  if (canViewRegistrations(role)) people.push({ href: '/dashboard/admin/registrations', label: 'Registrations', icon: Inbox })
  if (canManageAllUsers(role)) people.push({ href: '/dashboard/admin/users', label: 'Users', icon: UserCog })

  const workspace: NavItem[] = [{ href: '/dashboard/files', label: 'Files', icon: Folder }]
  if (canManageAllUsers(role)) workspace.push({ href: '/dashboard/admin/activity', label: 'Activity', icon: Activity })
  workspace.push({ href: '/dashboard/admin/settings', label: 'Settings', icon: Settings })

  return [
    {
      items: [
        { href: '/dashboard/admin', label: 'Dashboard', icon: Home, tab: true, tabLabel: 'Home' },
        { href: '/dashboard/admin/attendance', label: 'Attendance', icon: ClipboardCheck, tab: true },
        { href: '/dashboard/admin/students', label: 'Students', icon: Users, tab: true },
        { href: '/dashboard/admin/exams', label: 'Exams', icon: FileText },
        { href: '/dashboard/admin/curriculum', label: 'Curriculum', icon: BookOpen },
        { href: '/dashboard/admin/confession', label: 'Confession', icon: Cross, tab: true },
        { href: '/dashboard/admin/mentees', label: 'Mentees', icon: UserCheck },
      ],
    },
    { label: 'People', items: people },
    { label: 'Workspace', items: workspace },
  ]
}

function sundaySchoolNav(user: NavUser): NavGroup[] {
  const role = user.role
  const ssAdmin = canAdministerSundaySchool(role)

  const leaders: NavItem[] = [{ href: '/dashboard/servants/classes', label: 'Classes', icon: School }]
  if (ssAdmin) leaders.push({ href: '/dashboard/servants/age-groups', label: 'Age groups', icon: Layers })
  if (ssAdmin || user.sundaySchool?.isCoordinator) {
    leaders.push({ href: '/dashboard/servants/child-registrations', label: 'Child registrations', icon: UserPlus })
  }
  leaders.push({ href: '/dashboard/servants/servant-attendance', label: 'Servant attendance', icon: CalendarCheck })

  const admin: NavItem[] = []
  if (canReviewServantApplications(role)) {
    admin.push({ href: '/dashboard/servants/servant-applications', label: 'Servant applications', icon: HandHeart })
  }
  if (ssAdmin) admin.push({ href: '/dashboard/servants/users', label: 'Users', icon: UserCog })
  if (canManageAllUsers(role)) admin.push({ href: '/dashboard/servants/activity', label: 'Activity', icon: Activity })

  const main: NavItem[] = [
    { href: '/dashboard/servants', label: 'Dashboard', icon: Home, tab: true, tabLabel: 'Home' },
    { href: '/dashboard/servants/lessons', label: 'Lessons', icon: Presentation, tab: true },
    ...(user.sundaySchool?.hasHomeworkAccess
      ? [{ href: '/dashboard/servants/homework', label: 'Homework', icon: NotebookPen }]
      : []),
    { href: '/dashboard/servants/attendance', label: 'Attendance', icon: ClipboardCheck, tab: true },
    { href: '/dashboard/servants/roster', label: 'Roster', icon: Users, tab: true },
    { href: '/dashboard/servants/birthdays', label: 'Birthdays', icon: Cake },
    { href: '/dashboard/servants/visitations', label: 'Visitations', icon: HandHeart },
  ]
  const feedback: NavItem = { href: '/dashboard/servants/feedback', label: 'Feedback', icon: MessageSquare }
  // Feedback is open to every servant; it sits with the admin tools only when
  // there are admin tools, so a servant never sees an "Admin" heading.
  if (admin.length > 0) admin.push(feedback)
  else main.push(feedback)

  const groups: NavGroup[] = [{ items: main }, { label: 'Leaders', items: leaders }]
  if (admin.length > 0) groups.push({ label: 'Admin', items: admin })
  return groups
}

export function navigationFor(user: NavUser, ministry: Ministry): NavGroup[] {
  const role = user.role

  if (ministry === 'sunday-school' && (role === 'SERVANT' || user.sundaySchool?.hasAccess)) {
    return sundaySchoolNav(user)
  }

  switch (role) {
    case 'STUDENT': {
      const groups: NavGroup[] = [
        {
          items: [
            { href: '/dashboard/student', label: 'My progress', icon: Home, tab: true, tabLabel: 'Progress' },
            { href: '/dashboard/student/lessons', label: 'My lessons', icon: BookOpen, tab: true, tabLabel: 'Lessons' },
            { href: '/dashboard/student/class-lessons', label: 'Class lessons', icon: Presentation, tab: true, tabLabel: 'Class' },
            { href: '/dashboard/files', label: 'Files', icon: Folder, tab: true },
          ],
        },
      ]
      if (user.isAsyncStudent) {
        groups.push({
          label: 'Async student',
          items: [
            { href: '/dashboard/student/attendance-slip', label: 'Attendance slip', icon: FileText },
            { href: '/dashboard/student/sunday-school', label: 'Sunday School', icon: ClipboardCheck },
          ],
        })
      }
      groups.push({
        label: 'Account',
        items: [
          { href: '/dashboard/student/application', label: 'Application', icon: GraduationCap },
          { href: '/settings', label: 'My account', icon: SlidersHorizontal },
        ],
      })
      return groups
    }
    case 'MENTOR':
      return [
        {
          items: [
            { href: '/dashboard/mentor', label: 'Dashboard', icon: Home, tab: true, tabLabel: 'Home' },
            { href: '/dashboard/mentor/my-mentees', label: 'My mentees', icon: Users, tab: true, tabLabel: 'Mentees' },
            { href: '/dashboard/files', label: 'Files', icon: Folder, tab: true },
          ],
        },
      ]
    case 'PARENT':
      return [
        {
          items: [
            { href: '/dashboard/parent', label: 'My children', icon: Users, tab: true, tabLabel: 'Children' },
            { href: '/dashboard/parent?register=1', label: 'Register a child', icon: UserPlus, tab: true, tabLabel: 'Register' },
          ],
        },
        { label: 'Account', items: [{ href: '/settings', label: 'My account', icon: SlidersHorizontal, tab: true, tabLabel: 'Account' }] },
      ]
    case 'SERVANT':
      return sundaySchoolNav(user)
    default:
      return prepAdminNav(role)
  }
}

/** Dashboards match exactly; everything else also matches its sub-routes. */
export function isNavItemActive(href: string, pathname: string, search = ''): boolean {
  const [path, query] = href.split('?')
  if (query) return pathname === path && new URLSearchParams(search).toString().includes(query)
  if (
    path === '/dashboard/admin' ||
    path === '/dashboard/mentor' ||
    path === '/dashboard/student' ||
    path === '/dashboard/servants' ||
    path === '/dashboard/parent'
  ) {
    return pathname === path && !search.includes('register=1')
  }
  return pathname === path || pathname.startsWith(path + '/')
}

/** The breadcrumb's page name for the current path, from the nav. */
export function currentNavLabel(groups: NavGroup[], pathname: string, search = ''): string | null {
  let best: NavItem | null = null
  for (const item of groups.flatMap((g) => g.items)) {
    if (!isNavItemActive(item.href, pathname, search)) continue
    if (!best || item.href.length > best.href.length) best = item
  }
  return best?.label ?? null
}
