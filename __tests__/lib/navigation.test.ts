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
    expect(groups.map((g) => g.label)).toEqual([undefined, 'People', 'Workspace'])
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
      expect(hrefs('SERVANT', ministry, servesSS).every((h) => h.startsWith('/dashboard/servants'))).toBe(true)
    }
  })

  it('gives a servant Feedback without an Admin heading', () => {
    const groups = navigationFor({ role: 'SERVANT', ...servesSS }, 'sunday-school')
    expect(groups.map((g) => g.label)).not.toContain('Admin')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).toContain('/dashboard/servants/feedback')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).toContain('/dashboard/servants/birthdays')
    expect(hrefs('SERVANT', 'sunday-school', servesSS)).not.toContain('/dashboard/servants/child-registrations')
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
  it('offers both only to prep leaders and mentors who also serve', () => {
    expect(availableMinistries({ role: 'SUPER_ADMIN', ...servesSS }).map((m) => m.id)).toEqual(['prep', 'sunday-school'])
    expect(availableMinistries({ role: 'MENTOR', ...servesSS })).toHaveLength(2)
    expect(availableMinistries({ role: 'SUPER_ADMIN', ...noSS })).toHaveLength(1)
    expect(availableMinistries({ role: 'STUDENT', ...servesSS })).toHaveLength(1)
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
    expect(currentNavLabel(groups, '/dashboard/admin')).toBe('Dashboard')
  })
})
