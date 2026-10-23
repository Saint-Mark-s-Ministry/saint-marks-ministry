'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getTodayDateInputValue } from '@/lib/sunday-school-class'

/** The same weekday one meeting earlier or later (meetings are weekly). */
function shiftWeek(day: string, weeks: number) {
  const date = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return day
  date.setUTCDate(date.getUTCDate() + weeks * 7)
  return date.toISOString().slice(0, 10)
}

/** Meeting date with previous/next arrows; the date field stays for jumping further back. */
export function MeetingDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const today = getTodayDateInputValue()
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" aria-label="Previous meeting" disabled={!value} onClick={() => onChange(shiftWeek(value, -1))}>
        <ChevronLeft />
      </Button>
      <Input type="date" aria-label="Date" value={value} max={today} onChange={(e) => onChange(e.target.value)} className="w-40 md:h-8" />
      <Button variant="ghost" size="icon" aria-label="Next meeting" disabled={!value || shiftWeek(value, 1) > today} onClick={() => onChange(shiftWeek(value, 1))}>
        <ChevronRight />
      </Button>
    </div>
  )
}
