'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/admin/page-header'
import { SundaySchoolAttendanceChart } from '@/components/sunday-school-attendance-chart'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolDashboard } from '@/lib/swr'
import {
  compareAgeGroupsByLevel,
  compareClassesByLevelAndName,
  getLevelDisplayName,
} from '@/lib/sunday-school-class'
import type {
  SundaySchoolAttendanceAudience,
  SundaySchoolClassSummary,
  SundaySchoolDashboard,
} from '@/types/sunday-school'
import { Users, CalendarCheck, ClipboardList, ArrowRight, School, type LucideIcon } from 'lucide-react'

const UNBANDED = '__unbanded__'

function DashboardShortcutCard({
  href,
  icon: Icon,
  value,
  label,
  hint,
}: {
  href: string
  icon: LucideIcon
  value: number
  label: string
  hint: string
}) {
  return (
    <Card className="group overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-maroon-200 hover:shadow-md dark:hover:border-maroon-800">
      <Link
        href={href}
        aria-label={`${value} ${label}. ${hint}`}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-maroon-600 focus-visible:ring-offset-2"
      >
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Icon className="h-5 w-5 shrink-0 text-maroon-600" />
              <div className="min-w-0">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
                <p className="mt-1 truncate text-xs font-medium text-maroon-700 dark:text-maroon-300">
                  {hint}
                </p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-gray-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-maroon-600 dark:group-hover:text-maroon-300" />
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}

export default function SundaySchoolDashboardPage() {
  const { session, status } = useSundaySchoolGuard()
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>()
  const [selectedClassId, setSelectedClassId] = useState<string>()
  const [attendanceAudience, setAttendanceAudience] = useState<SundaySchoolAttendanceAudience>('children')
  const { data, isLoading, isValidating } = useSundaySchoolDashboard(
    selectedAcademicYearId,
    selectedClassId,
    attendanceAudience,
    { keepPreviousData: true }
  )

  const dashboard = data as SundaySchoolDashboard | undefined

  // An age-group coordinator runs several classes, so group the list by band.
  // A servant with one class sees a single group and never notices.
  const grouped = useMemo(() => {
    const classes = dashboard?.classes ?? []
    const buckets = new Map<string, { name: string; classes: SundaySchoolClassSummary[] }>()

    for (const cls of classes) {
      const key = cls.ageGroup?.id ?? UNBANDED
      const name = cls.ageGroup?.name ?? 'Other classes'
      if (!buckets.has(key)) buckets.set(key, { name, classes: [] })
      buckets.get(key)!.classes.push(cls)
    }

    for (const bucket of buckets.values()) {
      bucket.classes.sort(compareClassesByLevelAndName)
    }

    const order = [...(dashboard?.ageGroups ?? [])]
      .sort(compareAgeGroupsByLevel)
      .map(group => group.id)
    return Array.from(buckets.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0])
      const bi = order.indexOf(b[0])
      return (ai === -1 ? Number.MAX_SAFE_INTEGER : ai) - (bi === -1 ? Number.MAX_SAFE_INTEGER : bi)
    })
  }, [dashboard])

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  const totals = dashboard?.totals
  const standing = dashboard?.standing
  const classCount = dashboard?.classes.length ?? 0
  const singleClass = classCount === 1 ? dashboard?.classes[0] : undefined
  const classHref = singleClass
    ? `/dashboard/servants/classes/${singleClass.id}`
    : '/dashboard/servants/classes'
  const rosterHref = singleClass
    ? `/dashboard/servants/roster?classId=${singleClass.id}`
    : '/dashboard/servants/roster'
  const attendanceHref = singleClass
    ? `/dashboard/servants/attendance?classId=${singleClass.id}`
    : '/dashboard/servants/attendance'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Sunday School"
          description={`Welcome, ${session?.user?.name ?? ''}. Take attendance and keep your class rosters up to date.`}
          actions={
            <div className="flex gap-2">
              {standing?.isAdmin && (
                <Button asChild variant="outline">
                  <Link href="/dashboard/servants/age-groups">Age groups</Link>
                </Button>
              )}
              <Button asChild>
                <Link href="/dashboard/servants/classes">Classes</Link>
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <DashboardShortcutCard
            href={classHref}
            icon={School}
            value={totals?.classes ?? 0}
            label={(totals?.classes ?? 0) === 1 ? 'Class' : 'Classes'}
            hint={singleClass ? `Open ${singleClass.name}` : 'View all classes'}
          />
          <DashboardShortcutCard
            href={rosterHref}
            icon={Users}
            value={totals?.children ?? 0}
            label="Children"
            hint={singleClass ? `Open ${singleClass.name} roster` : 'Open rosters'}
          />
          <DashboardShortcutCard
            href={attendanceHref}
            icon={CalendarCheck}
            value={totals?.classesNeedingAttendance ?? 0}
            label="Need attendance this week"
            hint={singleClass ? `Take ${singleClass.name} attendance` : 'Open attendance'}
          />
        </div>

        {dashboard?.attendanceTrend && (
          <SundaySchoolAttendanceChart
            trend={dashboard.attendanceTrend}
            selectedAcademicYearId={selectedAcademicYearId}
            selectedClassId={selectedClassId}
            audience={attendanceAudience}
            onAcademicYearChange={(academicYearId) => {
              setSelectedAcademicYearId(academicYearId)
              setSelectedClassId(undefined)
              setAttendanceAudience('children')
            }}
            onClassChange={setSelectedClassId}
            onAudienceChange={(audience) => {
              setAttendanceAudience(audience)
              setSelectedClassId(undefined)
            }}
            isRefreshing={isValidating && !isLoading}
          />
        )}

        {classCount === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                message={
                  standing?.isAdmin
                    ? 'No classes yet. Create one to start building a roster and taking attendance.'
                    : 'You have not been assigned to a Sunday School class yet. Ask your coordinator or a super admin to add you.'
                }
              />
            </CardContent>
          </Card>
        ) : (
          grouped.map(([key, band]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{band.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {band.classes.map(cls => (
                    <div
                      key={cls.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border rounded-lg dark:border-gray-800"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/dashboard/servants/classes/${cls.id}`}
                            className="font-medium hover:underline"
                          >
                            {cls.name}
                          </Link>
                          <Badge variant="secondary">{getLevelDisplayName(cls.level)}</Badge>
                          {cls.canCoordinate && <Badge className="bg-maroon-600">Coordinator</Badge>}
                          {!cls.attendanceTakenThisWeek && cls.canServe && (
                            <Badge className="bg-yellow-600">Attendance due</Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {cls.childCount} {cls.childCount === 1 ? 'child' : 'children'} ·{' '}
                          {cls.sessionCount} {cls.sessionCount === 1 ? 'session' : 'sessions'}
                          {cls.sessionCount > 0 && ` · ${cls.attendancePercentage.toFixed(0)}% attendance`}
                        </p>
                        {cls.servants.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                            Servants:{' '}
                            {cls.servants
                              .map(s => (s.isCoordinator ? `${s.name} (coordinator)` : s.name))
                              .join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/dashboard/servants/roster?classId=${cls.id}`}>
                            <ClipboardList className="h-4 w-4 mr-1" />
                            Roster
                          </Link>
                        </Button>
                        {cls.canServe && (
                          <Button asChild size="sm">
                            <Link href={`/dashboard/servants/attendance?classId=${cls.id}`}>
                              Take attendance
                              <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
