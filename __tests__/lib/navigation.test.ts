import { describe, expect, it } from 'vitest'
import type { UserRole } from '@prisma/client'
import {
  availableMinistries,
  currentNavLabel,
  isNavItemActive,
  navigationFor,
  resolveMinistry,
} from '@/lib/navigation'

const hrefs = (role: UserRole, ministry: 'prep' | 'sunday-school', extra: object = {}) =>
  navigationFor({ role, ...extra }, ministry).flatMap((g) => g.items.map((i) => i.href))

const noSS = { sundaySchool: { hasAccess: false, isCoordinator: false } }
const servesSS = { sundaySchool: { hasAccess: true, isCoordinator: false } }

describe('navigationFor', () => {
  it('gives a super admin every prep destination, grouped', () => {
    const groups = navigationFor({ role: 'SUPER_ADMIN', ...noSS }, 'prep')
    expect(groups.map((g) => g.label)).toEqual([undefined, 'People', 'Workspace', 'Church', 'Updates'])
    expect(hrefs('SUPER_ADMIN', 'prep', noSS)).toEqual(
      expect.arrayContaining([
        '/dashboard/admin/users',
        '/dashboard/admin/activity',
        '/dashboard/admin/enrollments',
        '/dashboard/admin/registrations',
        '/dashboard/admin/settings',
      ])
    )
  })

  it('keeps user management away from roles that cannot manage all users', () => {
    for (const role of ['SERVANT_PREP', 'PRIEST'] as UserRole[]) {
      const links = hrefs(role, 'prep', noSS)
      expect(links).not.toContain('/dashboard/admin/users')
      expect(links).not.toContain('/dashboard/admin/activity')
    }
  })

  it('shows async pages only to async students', () => {
    expect(hrefs('STUDENT', 'prep')).not.toContain('/dashboard/student/attendance-slip')
    expect(hrefs('STUDENT', 'prep', { isAsyncStudent: true })).toContain('/dashboard/student/attendance-slip')
  })

  it('never shows prep pages to a SERVANT, whatever the path', () => {
    for (const ministry of ['prep', 'sunday-school'] as const) {
      expect(
        hrefs('SERVANT', ministry, servesSS).every((h) => h.startsWith('/dashboard/servants') || h === '/dashboard/readings')
      ).toBe(true)
    }
  })

  it('gives every role the daily readings, outside the phone tab bar', () => {
    for (const role of ['SUPER_ADMIN', 'PRIEST', 'SERVANT_PREP', 'MENTOR', 'STUDENT', 'PARENT', 'SERVANT'] as UserRole[]) {
      for (const ministry of ['prep', 'sunday-school'] as const) {
        const item = navigationFor({ role, ...servesSS }, ministry)
          .flatMap((g) => g.items)
          .find((i) => i.href === '/dashboard/readings')
        expect(item).toBeDefined()
        expect(item?.tab).not.toBe(true)
      }
    }
  })

  it('gives every role release notes in the current ministry, outside the phone tabs', () => {
    for (const role of ['SUPER_ADMIN', 'PRIEST', 'SERVANT_PREP', 'MENTOR', 'STUDENT', 'PARENT', 'SERVANT'] as UserRole[]) {
      for (const { id: ministry } of availableMinistries({ role, ...servesSS })) {
        const sundaySchool = ministry === 'sunday-school'
        const path = sundaySchool ? '/dashboard/servants/whats-new' : '/dashboard/whats-new'
        const groups = navigationFor({ role, ...servesSS }, ministry)
        const item = groups.flatMap(group => group.items).find(item => item.href === path)
        expect(item?.label).toBe('What’s new')
        expect(item?.tab).not.toBe(true)
        expect(currentNavLabel(groups, path)).toBe('What’s new')
        expect(resolveMinistry({ role, ...servesSS }, path)).toBe(sundaySchool ? 'sunday-school' : 'prep')
      }
    }
  })

  it('shows Feedback in prep staff navigation without switching to Sunday School', () => {
    for (const role of ['SUPER_ADMIN', 'SERVANT_PREP', 'PRIEST'] as UserRole[]) {
      const groups = navigationFor({ role, ...noSS }, 'prep')
      expect(groups.find(group => group.label === 'Workspace')?.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ href: '/dashboard/admin/feedback', label: 'Feedback' }),
      ]))
      expect(currentNavLabel(groups, '/dashboard/admin/feedback')).toBe('Feedback')
      expect(resolveMinistry({ role, ...servesSS }, '/dashboard/admin/feedback')).toBe('prep')
    }
    expect(hrefs('STUDENT', 'prep', noSS)).not.toContain('/dashboard/admin/feedback')
    expect(hrefs('MENTOR', 'prep', noSS)).not.toContain('/dashboard/admin/feedback')
  })

  it('gives a servant Feedback without an Admin heading', () => {
    const groups = navigationFor({ role: 'SERVANT', ...servesSS }, 'sunday-school')
    expect(groups.map((g) => g.label)).not.toContain('Admin')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).toContain('/dashboard/servants/feedback')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).toContain('/dashboard/servants/birthdays')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).not.toContain('/dashboard/servants/child-registrations')
  })

  it('keeps the meeting check-in destination out of the sidebar', () => {
    for (const role of ['SERVANT', 'MENTOR', 'SERVANT_PREP', 'SUPER_ADMIN', 'PRIEST'] as UserRole[]) {
      const groups = navigationFor({ role, ...servesSS }, 'sunday-school')
      expect(groups.flatMap(group => group.items).map(item => item.href))
        .not.toContain('/dashboard/servants/servant-attendance/meetings')
    }
  })

  it('shows child registrations to coordinators', () => {
    const coordinator = { sundaySchool: { hasAccess: true, isCoordinator: true } }
    expect(hrefs('SERVANT', 'sunday-school', coordinator)).toContain('/dashboard/servants/child-registrations')
  })

  it('shows Homework only with Elementary scope and keeps it out of the phone tabs', () => {
    const elementary = { sundaySchool: { hasAccess: true, isCoordinator: false, hasHomeworkAccess: true } }
    const older = { sundaySchool: { hasAccess: true, isCoordinator: false, hasHomeworkAccess: false } }
    expect(hrefs('SERVANT', 'sunday-school', elementary)).toContain('/dashboard/servants/homework')
    expect(hrefs('SERVANT', 'sunday-school', older)).not.toContain('/dashboard/servants/homework')
    const homework = navigationFor({ role: 'SERVANT', ...elementary }, 'sunday-school')
      .flatMap(group => group.items)
      .find(item => item.href === '/dashboard/servants/homework')
    expect(homework?.tab).not.toBe(true)
  })

  it('gives parents their own nav, not the admin one', () => {
    const links = hrefs('PARENT', 'sunday-school')
    expect(links).toContain('/dashboard/parent')
    expect(links.some((h) => h.startsWith('/dashboard/admin'))).toBe(false)
  })

  it('puts at most four items in the phone tab bar', () => {
    for (const role of ['SUPER_ADMIN', 'MENTOR', 'STUDENT', 'PARENT', 'SERVANT'] as UserRole[]) {
      for (const ministry of ['prep', 'sunday-school'] as const) {
        const tabs = navigationFor({ role, ...servesSS }, ministry).flatMap((g) => g.items).filter((i) => i.tab)
        expect(tabs.length).toBeLessThanOrEqual(4)
      }
    }
  })
})

describe('ministries', () => {
  it('offers both only to prep servants and mentors who also serve', () => {
    expect(availableMinistries({ role: 'SUPER_ADMIN', ...servesSS }).map((m) => m.id)).toEqual(['prep', 'sunday-school'])
    expect(availableMinistries({ role: 'MENTOR', ...servesSS })).toHaveLength(2)
    expect(availableMinistries({ role: 'SUPER_ADMIN', ...noSS })).toHaveLength(1)
    expect(availableMinistries({ role: 'STUDENT', ...servesSS })).toHaveLength(1)
  })

  it('puts Sunday School first for a servant without Servants Prep service', () => {
    const user = {
      role: 'MENTOR' as const,
      ...servesSS,
      ministryMembership: { sundaySchoolServant: true, servantsPrepLeader: false },
    }
    expect(availableMinistries(user).map((ministry) => ministry.id)).toEqual(['sunday-school', 'prep'])
    expect(resolveMinistry(user, '/settings')).toBe('sunday-school')
    expect(resolveMinistry(user, '/dashboard/mentor')).toBe('prep')
  })

  it('keeps single-ministry users in their ministry on shared pages', () => {
    expect(resolveMinistry({ role: 'SERVANT', ...servesSS }, '/settings')).toBe('sunday-school')
    expect(resolveMinistry({ role: 'PARENT' }, '/settings')).toBe('sunday-school')
    expect(resolveMinistry({ role: 'SUPER_ADMIN', ...servesSS }, '/dashboard/servants/roster')).toBe('sunday-school')
    expect(resolveMinistry({ role: 'SUPER_ADMIN', ...servesSS }, '/settings')).toBe('prep')
  })
})

describe('active state', () => {
  it('matches dashboards exactly and sections by prefix', () => {
    expect(isNavItemActive('/dashboard/admin', '/dashboard/admin/students')).toBe(false)
    expect(isNavItemActive('/dashboard/admin/students', '/dashboard/admin/students')).toBe(true)
    expect(isNavItemActive('/dashboard/servants/classes', '/dashboard/servants/classes/abc')).toBe(true)
  })

  it('tells the parent register link apart from the children page', () => {
    expect(isNavItemActive('/dashboard/parent?register=1', '/dashboard/parent', 'register=1')).toBe(true)
    expect(isNavItemActive('/dashboard/parent', '/dashboard/parent', 'register=1')).toBe(false)
  })

  it('labels the breadcrumb from the most specific match', () => {
    const groups = navigationFor({ role: 'SUPER_ADMIN', ...noSS }, 'prep')
    expect(currentNavLabel(groups, '/dashboard/admin/exams')).toBe('Exams')
    expect(currentNavLabel(groups, '/dashboard/admin/exam-monitoring')).toBe('Exam Monitoring')
    expect(currentNavLabel(groups, '/dashboard/admin')).toBe('Dashboard')
  })
})


describe('contact book navigation', () => {
  it('requires explicit permission in both ministries for non-admin roles', () => {
    for (const role of ['PRIEST', 'SERVANT_PREP', 'MENTOR', 'STUDENT', 'SERVANT', 'PARENT'] as UserRole[]) {
      for (const ministry of ['prep', 'sunday-school'] as const) {
        expect(hrefs(role, ministry, servesSS)).not.toContain('/dashboard/contact-book')
        expect(hrefs(role, ministry, { ...servesSS, canAccessContactBook: true })).toContain('/dashboard/contact-book')
      }
    }
  })
  it('hides the contact book from super admins even with a stored grant', () => {
    for (const ministry of ['prep', 'sunday-school'] as const) {
      expect(hrefs('SUPER_ADMIN', ministry, servesSS)).not.toContain('/dashboard/contact-book')
      expect(hrefs('SUPER_ADMIN', ministry, { ...servesSS, canAccessContactBook: true })).not.toContain('/dashboard/contact-book')
    }
  })
  it('uses the default ministry for the shared contact book page', () => {
    expect(resolveMinistry({ role: 'SERVANT', ...servesSS }, '/dashboard/contact-book')).toBe('sunday-school')
    expect(resolveMinistry({ role: 'SUPER_ADMIN', ...servesSS }, '/dashboard/contact-book')).toBe('prep')
    expect(resolveMinistry({ role: 'SUPER_ADMIN', ...servesSS }, '/dashboard/readings')).toBe('prep')
    expect(resolveMinistry({ role: 'SERVANT', ...servesSS }, '/dashboard/readings')).toBe('sunday-school')
  })
})
