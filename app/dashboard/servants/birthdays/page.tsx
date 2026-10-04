'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Cake, CalendarDays } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { PageLoading } from '@/components/ui/page-loading'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { Initials } from '@/components/ds/person'
import { StatusBadge } from '@/components/ds/status-badge'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolBirthdays, useSundaySchoolClasses } from '@/lib/swr'
import {
  ageOnBirthdayInYear,
  BIRTHDAY_MONTHS,
  compareBirthdays,
  formatBirthday,
  getBirthdayParts,
} from '@/lib/sunday-school-birthdays'
import { getChildFullName, getChildPhotoUrl, getLevelDisplayName } from '@/lib/sunday-school-class'
import type { SundaySchoolBirthdayChild, SundaySchoolClass } from '@/types/sunday-school'

const MONTH_OPTIONS = [
  { value: 'all', label: 'All months' },
  ...BIRTHDAY_MONTHS.map((label, index) => ({ value: String(index + 1), label })),
]

export default function SundaySchoolBirthdaysPage() {
  const { status } = useSundaySchoolGuard()
  const { data, error, isLoading } = useSundaySchoolBirthdays()
  const { data: classesData } = useSundaySchoolClasses()
  const [month, setMonth] = useState('all')
  const [classId, setClassId] = useState('all')

  const classes = useMemo(
    () => (classesData as SundaySchoolClass[] | undefined) ?? [],
    [classesData]
  )
  const childrenWithBirthdays = useMemo(
    () => [...((data as SundaySchoolBirthdayChild[] | undefined) ?? [])].sort(compareBirthdays),
    [data]
  )
  const visibleChildren = useMemo(
    () => childrenWithBirthdays.filter(child => {
      const birthday = child.birthDate ? getBirthdayParts(child.birthDate) : null
      return (
        (classId === 'all' || child.classId === classId) &&
        (month === 'all' || birthday?.month === Number(month))
      )
    }),
    [childrenWithBirthdays, classId, month]
  )
  const groups = useMemo(() => {
    const byMonth = new Map<number, SundaySchoolBirthdayChild[]>()
    for (const child of visibleChildren) {
      const birthday = child.birthDate ? getBirthdayParts(child.birthDate) : null
      if (!birthday) continue
      const group = byMonth.get(birthday.month) ?? []
      group.push(child)
      byMonth.set(birthday.month, group)
    }
    return [...byMonth.entries()].sort(([left], [right]) => left - right)
  }, [visibleChildren])

  if (status === 'loading') return <PageLoading />

  const now = new Date()
  const currentYear = now.getFullYear()
  const todayMonth = now.getMonth() + 1
  const todayDay = now.getDate()

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Birthdays"
        meta={['Children’s birthdays for the classes you serve']}
      />

      <Panel
        toolbar={
          <>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
              Month
              <FilterSelect
                aria-label="Birthday month"
                value={month}
                onChange={setMonth}
                options={MONTH_OPTIONS}
              />
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
              Class
              <FilterSelect
                aria-label="Class"
                value={classId}
                onChange={setClassId}
                options={[
                  { value: 'all', label: 'All classes' },
                  ...classes.map(classroom => ({ value: classroom.id, label: classroom.name })),
                ]}
              />
            </label>
          </>
        }
        footer={<span>{visibleChildren.length} birthdays</span>}
      >
        {isLoading ? (
          <EmptyState message="Loading birthdays…" />
        ) : error ? (
          <EmptyState
            title="Couldn’t load birthdays"
            message="Try again in a moment."
          />
        ) : classes.length === 0 ? (
          <EmptyState message="You are not assigned to a Sunday School class yet." />
        ) : visibleChildren.length === 0 ? (
          <EmptyState
            icon={<Cake />}
            title="No birthdays found"
            message={
              childrenWithBirthdays.length === 0
                ? 'Add birth dates from the Roster page to start tracking birthdays.'
                : 'No children match the selected month and class.'
            }
          />
        ) : (
          <div className="divide-y divide-line">
            {groups.map(([birthdayMonth, children]) => (
              <section key={birthdayMonth} aria-labelledby={`birthday-month-${birthdayMonth}`}>
                <div className="flex items-center gap-2 bg-canvas px-4 py-2.5">
                  <CalendarDays className="size-4 text-accent-ink" aria-hidden />
                  <h2 id={`birthday-month-${birthdayMonth}`} className="text-sm font-semibold text-ink">
                    {BIRTHDAY_MONTHS[birthdayMonth - 1]}
                  </h2>
                  <span className="text-xs text-ink-3">{children.length}</span>
                </div>
                <ul className="divide-y divide-line">
                  {children.map(child => {
                    const birthday = getBirthdayParts(child.birthDate!)!
                    const age = ageOnBirthdayInYear(child.birthDate!, currentYear)
                    const isToday = birthday.month === todayMonth && birthday.day === todayDay
                    const hasPassed = birthday.month < todayMonth ||
                      (birthday.month === todayMonth && birthday.day < todayDay)

                    return (
                      <li
                        key={child.id}
                        className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Initials
                            name={getChildFullName(child)}
                            imageUrl={getChildPhotoUrl(child)}
                            size={36}
                          />
                          <div className="flex min-w-0 flex-col leading-tight">
                            <span className="truncate text-sm font-medium text-ink">
                              {getChildFullName(child)}
                            </span>
                            <span className="text-xs text-ink-3">
                              {child.class?.name ?? getLevelDisplayName(child.level)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3 pl-12 sm:justify-end sm:pl-0">
                          <div className="text-right">
                            <p className="text-sm font-medium text-ink">{formatBirthday(child.birthDate!)}</p>
                            {age !== null && (
                              <p className="text-xs text-ink-3">
                                {hasPassed ? 'Turned' : 'Turns'} {age} in {currentYear}
                              </p>
                            )}
                          </div>
                          {isToday && <StatusBadge tone="accent">Today</StatusBadge>}
                          <Link
                            href={`/dashboard/servants/roster?classId=${child.classId ?? ''}`}
                            className="text-xs font-medium text-accent-ink hover:underline"
                          >
                            Roster
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
