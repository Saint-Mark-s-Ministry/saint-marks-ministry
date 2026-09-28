'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts'

export interface AttendancePoint {
  label: string
  date: string
  attendanceRate: number | null
  presentCount: number
  totalCount: number
}

export interface ExamPoint {
  label: string
  date: string
  average: number | null
  section: string
  scoreCount: number
}

interface AttendanceTrendChartProps {
  data: AttendancePoint[]
  required?: number
}

export function AttendanceTrendChart({ data, required = 75 }: AttendanceTrendChartProps) {
  const hasData = data.some(d => d.attendanceRate !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance Trend</CardTitle>
        <CardDescription>Class-wide attendance rate per lesson</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickMargin={6} />
                <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(value) => {
                    const v = typeof value === 'number' ? value : null
                    return v === null ? '—' : `${v.toFixed(1)}%`
                  }}
                  labelClassName="font-medium"
                  contentStyle={{
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                  }}
                />
                <ReferenceLine y={required} stroke="var(--chart-target)" strokeDasharray="4 4" label={{ value: `${required}% target`, position: 'right', fill: 'var(--chart-target)', fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="attendanceRate"
                  stroke="var(--chart-attendance)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--chart-attendance)' }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  name="Attendance %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex items-center justify-center text-sm text-gray-500">
            Not enough attendance data to plot a trend yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ExamTrendChartProps {
  data: ExamPoint[]
  required?: number
}

export function ExamTrendChart({ data, required = 75 }: ExamTrendChartProps) {
  const hasData = data.some(d => d.average !== null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exam Score Trend</CardTitle>
        <CardDescription>Class average per exam, by date</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickMargin={6} />
                <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip
                  formatter={(value) => {
                    const v = typeof value === 'number' ? value : null
                    return v === null ? '—' : `${v.toFixed(1)}%`
                  }}
                  contentStyle={{
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)',
                  }}
                />
                <ReferenceLine y={required} stroke="var(--chart-target)" strokeDasharray="4 4" label={{ value: `${required}% target`, position: 'right', fill: 'var(--chart-target)', fontSize: 11 }} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="average"
                  stroke="var(--chart-exam)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--chart-exam)' }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  name="Class Average"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-72 flex items-center justify-center text-sm text-gray-500">
            Not enough exam scores to plot a trend yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}
