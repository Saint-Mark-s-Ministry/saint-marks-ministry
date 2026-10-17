'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSundaySchoolMeetings } from '@/lib/swr'
import { getSundaySchoolTodayDateInputValue } from '@/lib/sunday-school-class'

/** The server checks today's meeting and the signed-in servant's own assignment. */
export function SundaySchoolMeetingCheckInShortcut({ ageGroupId }: { ageGroupId: string }) {
  const { data, error } = useSundaySchoolMeetings(ageGroupId)
  if (error || !data?.canCheckIn || !data.meeting ||
      data.meeting.date.slice(0, 10) !== getSundaySchoolTodayDateInputValue()) return null

  const params = new URLSearchParams({ ageGroupId, meetingId: data.meeting.id })
  return <Button asChild variant="outline">
    <Link href={`/dashboard/servants/servant-attendance/meetings?${params}`}>
      <ClipboardCheck />
      Meeting check-in
    </Link>
  </Button>
}
