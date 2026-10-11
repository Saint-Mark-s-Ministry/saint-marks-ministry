'use client'

import { Check, Clock, X, Shield } from 'lucide-react'

type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EXCUSED'

interface AttendanceStatusButtonsProps {
  currentStatus?: AttendanceStatus
  onStatusChange: (status: AttendanceStatus) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  showExcused?: boolean
  absentLabel?: string
}

const STATUS_CONFIG: {
  status: AttendanceStatus
  icon: typeof Check
  title: string
  activeColor: string
  hoverColor: string
  ink: string
}[] = [
  { status: 'PRESENT', icon: Check, title: 'Present', activeColor: 'border-ok bg-ok text-white dark:text-canvas', hoverColor: 'hover:border-ok hover:text-ok', ink: 'text-ok' },
  { status: 'LATE', icon: Clock, title: 'Late', activeColor: 'border-warn bg-warn text-white dark:text-canvas', hoverColor: 'hover:border-warn hover:text-warn', ink: 'text-warn' },
  { status: 'ABSENT', icon: X, title: 'Absent', activeColor: 'border-bad bg-bad text-white dark:text-canvas', hoverColor: 'hover:border-bad hover:text-bad', ink: 'text-bad' },
  { status: 'EXCUSED', icon: Shield, title: 'Excused (not counted)', activeColor: 'border-info bg-info text-white dark:text-canvas', hoverColor: 'hover:border-info hover:text-info', ink: 'text-info' },
]

/** Icon + word legend: status never relies on color alone (design system §04). */
export function AttendanceLegend({ showExcused = true, note }: { showExcused?: boolean; note?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      {STATUS_CONFIG.filter(({ status }) => showExcused || status !== 'EXCUSED').map(({ status, icon: Icon, title, ink }) => (
        <span key={status} className="inline-flex items-center gap-[5px]">
          <Icon className={`size-3.5 ${ink}`} strokeWidth={2.25} aria-hidden />
          {status === 'EXCUSED' ? 'Excused · not counted' : title}
        </span>
      ))}
      {note && <span className="w-full sm:ml-auto sm:w-auto">{note}</span>}
    </div>
  )
}

export function AttendanceStatusButtons({
  currentStatus,
  onStatusChange,
  disabled = false,
  size = 'md',
  showExcused = true,
  absentLabel = 'Absent',
}: AttendanceStatusButtonsProps) {
  // 44px touch targets on phones with 4px gaps; 30px (28px compact) on desktop.
  const sizeClasses = size === 'sm' ? 'size-11 md:size-7' : 'size-11 md:size-[30px]'
  const iconSize = size === 'sm' ? 'size-4 md:size-3.5' : 'size-[18px] md:size-4'
  const visibleStatuses = STATUS_CONFIG.filter(({ status }) => showExcused || status !== 'EXCUSED')

  return (
    <div className="flex gap-1">
      {visibleStatuses.map(({ status, icon: Icon, title, activeColor, hoverColor }) => {
        const accessibleLabel = status === 'ABSENT' ? absentLabel : title

        return (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(status)}
            disabled={disabled}
            aria-label={accessibleLabel}
            aria-pressed={currentStatus === status}
            className={`${sizeClasses} flex shrink-0 cursor-pointer items-center justify-center rounded-[7px] border transition-colors ${
              currentStatus === status
                ? activeColor
                : `border-line-strong bg-surface text-ink-3 ${hoverColor}`
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            title={accessibleLabel}
          >
            <Icon className={iconSize} strokeWidth={2.25} />
          </button>
        )
      })}
    </div>
  )
}
