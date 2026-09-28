'use client'

import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, LoaderCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolAttendanceAudience, SundaySchoolDashboard } from '@/types/sunday-school'

interface SundaySchoolAttendanceChartProps {
  trend: SundaySchoolDashboard['attendanceTrend']
  selectedAcademicYearId?: string
  selectedClassId?: string
  audience: SundaySchoolAttendanceAudience
  onAcademicYearChange: (academicYearId: string) => void
  onClassChange: (classId?: string) => void
  onAudienceChange: (audience: SundaySchoolAttendanceAudience) => void
  isRefreshing?: boolean
}

const ALL_CLASSES = '__all_classes__'

function formatChartDate(date: string, options: Intl.DateTimeFormatOptions) {
  return formatDateUTC(`${date}T00:00:00.000Z`, options)
}

export function SundaySchoolAttendanceChart({
  trend,
  selectedAcademicYearId,
  selectedClassId,
  audience,
  onAcademicYearChange,
  onClassChange,
  onAudienceChange,
  isRefreshing = false,
}: SundaySchoolAttendanceChartProps) {
  const recordedPoints = useMemo(
    () => trend.points.filter(point => point.rosterCount !== null),
    [trend.points]
  )
  const chartPoints = useMemo(
    () => trend.points.map(point => ({
      ...point,
      notRecorded: point.rosterCount === null ? 0 : null,
    })),
    [trend.points]
  )
  const latest = recordedPoints.at(-1)
  const totals = recordedPoints.reduce(
    (sum, point) => ({
      attended: sum.attended + (point.attendedCount ?? 0),
      roster: sum.roster + (point.rosterCount ?? 0),
    }),
    { attended: 0, roster: 0 }
  )
  const averageRate = totals.roster > 0 ? Math.round((totals.attended / totals.roster) * 100) : null
  const effectiveAcademicYearId = selectedAcademicYearId ?? trend.selectedAcademicYearId
  const selectedYear = trend.academicYears.find(year => year.id === effectiveAcademicYearId)
  const classOptions = trend.classes ?? []
  const requestedClassId = selectedClassId ?? trend.selectedClassId
  const selectedClass = classOptions.find(cls => cls.id === requestedClassId)
  const effectiveClassId = selectedClass?.id ?? ALL_CLASSES
  const attendanceScope = selectedClass?.name ?? 'all visible classes'
  const isServantAudience = audience === 'servants'
  const meetingDay = trend.meetingDayLabel ?? 'week'
  const meetingDescription = meetingDay === 'week' ? 'each week' : `each ${meetingDay}`
  const latestLabel = meetingDay === 'week' ? 'Latest week' : `Latest ${meetingDay}`
  const recordedLabel = meetingDay === 'week'
    ? `recorded ${recordedPoints.length === 1 ? 'week' : 'weeks'}`
    : `recorded ${recordedPoints.length === 1 ? meetingDay : `${meetingDay}s`}`

  return (
    <Card>
      <CardHeader className="gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-maroon-600" aria-hidden="true" />
            <CardTitle>Weekly Attendance</CardTitle>
          </div>
          <CardDescription>
            {isServantAudience ? 'Servants' : 'Children'} who attended compared with the roster recorded {meetingDescription}.
          </CardDescription>
        </div>
        {trend.academicYears.length > 0 && effectiveAcademicYearId && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {isRefreshing && (
              <LoaderCircle
                className="h-4 w-4 animate-spin text-gray-500"
                aria-label="Refreshing attendance chart"
              />
            )}
            {trend.canViewServantAttendance && (
              <Tabs
                value={audience}
                onValueChange={value => onAudienceChange(value as SundaySchoolAttendanceAudience)}
              >
                <TabsList aria-label="Attendance audience">
                  <TabsTrigger value="children">Children</TabsTrigger>
                  <TabsTrigger value="servants">Servants</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Select
              value={effectiveAcademicYearId}
              onValueChange={onAcademicYearChange}
            >
              <SelectTrigger className="w-[150px] bg-white dark:bg-gray-900" aria-label="Academic year">
                <SelectValue placeholder="Academic year" />
              </SelectTrigger>
              <SelectContent>
                {trend.academicYears.map(year => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {trend.canSelectClass && classOptions.length > 0 && (
              <Select
                value={effectiveClassId}
                onValueChange={value => onClassChange(value === ALL_CLASSES ? undefined : value)}
              >
                <SelectTrigger className="w-[190px] bg-white dark:bg-gray-900" aria-label="Class">
                  <SelectValue placeholder="All classes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>All classes</SelectItem>
                  {classOptions.map(cls => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {recordedPoints.length > 0 ? (
          <>
            <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2 border-y py-3 text-sm dark:border-gray-800">
              <span>
                <span className="text-gray-500 dark:text-gray-400">Year average </span>
                <strong className="tabular-nums">{averageRate}%</strong>
              </span>
              {latest && (
                <span>
                  <span className="text-gray-500 dark:text-gray-400">{latestLabel} </span>
                  <strong className="tabular-nums">
                    {latest.attendedCount} of {latest.rosterCount}
                  </strong>
                </span>
              )}
              <span className="text-gray-500 dark:text-gray-400">
                {recordedPoints.length} {recordedLabel}
              </span>
            </div>
            <div
              className="h-80 w-full"
              role="img"
              aria-label={`Weekly ${isServantAudience ? 'servant' : 'child'} attendance and roster for ${attendanceScope} in ${selectedYear?.name ?? 'the selected academic year'}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartPoints} margin={{ top: 8, right: 16, left: -12, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                    minTickGap={28}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickFormatter={date =>
                      formatChartDate(String(date), { month: 'short', day: 'numeric' })
                    }
                  />
                  <YAxis
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    width={42}
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                  />
                  <Tooltip
                    cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '4 4' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const point = payload[0]?.payload as SundaySchoolDashboard['attendanceTrend']['points'][number]

                      return (
                        <div className="min-w-44 rounded-lg border bg-white p-3 text-sm shadow-lg dark:bg-gray-900 dark:border-gray-700">
                          <p className="font-medium">
                            {formatChartDate(point.date, {
                              weekday: 'long',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </p>
                          {point.rosterCount === null ? (
                            <p className="mt-2 font-medium text-amber-600 dark:text-amber-400">
                              Attendance not recorded
                            </p>
                          ) : (
                            <div className="mt-2 space-y-1.5">
                              <p className="flex justify-between gap-6">
                                <span className="text-gray-500 dark:text-gray-400">Attended</span>
                                <strong className="tabular-nums">{point.attendedCount}</strong>
                              </p>
                              <p className="flex justify-between gap-6">
                                <span className="text-gray-500 dark:text-gray-400">On roster</span>
                                <strong className="tabular-nums">{point.rosterCount}</strong>
                              </p>
                              <p className="flex justify-between gap-6 border-t pt-1.5 dark:border-gray-700">
                                <span className="text-gray-500 dark:text-gray-400">Attendance rate</span>
                                <strong className="tabular-nums">{point.attendanceRate}%</strong>
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="attendedCount"
                    name="Attended"
                    stroke="var(--chart-attendance)"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: 'var(--chart-attendance)', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="rosterCount"
                    name="On roster"
                    stroke="var(--chart-roster)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                  <Line
                    type="linear"
                    dataKey="notRecorded"
                    name="Not recorded"
                    stroke="transparent"
                    dot={{ r: 3.5, fill: '#f59e0b', stroke: '#b45309', strokeWidth: 1.5 }}
                    activeDot={{ r: 5, fill: '#f59e0b', stroke: '#92400e', strokeWidth: 2 }}
                    legendType="diamond"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Amber markers indicate {meetingDay === 'week' ? 'weeks' : `${meetingDay}s`} when attendance was not recorded.
            </p>
          </>
        ) : (
          <div className="flex h-72 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
            No {isServantAudience ? 'servant' : 'child'} attendance has been recorded for {attendanceScope} in{' '}
            {selectedYear?.name ?? 'this year'} yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
