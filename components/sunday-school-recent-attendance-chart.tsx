'use client'

import { useMemo } from 'react'
import Link from 'next/link'
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
import { Activity, ArrowUpRight, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateUTC } from '@/lib/utils'
import type { SundaySchoolDashboard } from '@/types/sunday-school'

interface SundaySchoolRecentAttendanceChartProps {
  trend?: SundaySchoolDashboard['attendanceTrend']
  className: string
  throughDate: string
  isLoading?: boolean
}

function formatChartDate(date: string, options: Intl.DateTimeFormatOptions) {
  return formatDateUTC(`${date}T00:00:00.000Z`, options)
}

export function SundaySchoolRecentAttendanceChart({
  trend,
  className,
  throughDate,
  isLoading = false,
}: SundaySchoolRecentAttendanceChartProps) {
  const meetingDay = trend?.meetingDayLabel ?? 'week'
  const recentPoints = useMemo(
    () => (trend?.points ?? [])
      .filter(point => point.date <= throughDate)
      .slice(-8)
      .map(point => ({
        ...point,
        notRecorded: point.rosterCount === null ? 0 : null,
      })),
    [throughDate, trend?.points]
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-maroon-600" aria-hidden="true" />
            <CardTitle>Recent Attendance</CardTitle>
            {isLoading && (
              <LoaderCircle
                className="h-4 w-4 animate-spin text-gray-500"
                aria-label="Refreshing recent attendance"
              />
            )}
          </div>
          <CardDescription>
            The last eight {meetingDay === 'week' ? 'weeks' : `${meetingDay}s`} for {className} through the selected week.
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/dashboard/servants">
            Full chart
            <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {!trend && isLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            Loading recent attendance…
          </div>
        ) : recentPoints.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
            No attendance history is available for this class yet.
          </div>
        ) : (
          <>
            <div
              className="h-56 w-full"
              role="img"
              aria-label={`Recent attendance and roster for ${className}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={recentPoints} margin={{ top: 8, right: 16, left: -12, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tickMargin={8}
                    minTickGap={16}
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
                        <div className="min-w-44 rounded-lg border bg-white p-3 text-sm shadow-lg dark:border-gray-700 dark:bg-gray-900">
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
                            </div>
                          )}
                        </div>
                      )
                    }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
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
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Amber markers indicate {meetingDay === 'week' ? 'weeks' : `${meetingDay}s`} when attendance was not recorded.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
