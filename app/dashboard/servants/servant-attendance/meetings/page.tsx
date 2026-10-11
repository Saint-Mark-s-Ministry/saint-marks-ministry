'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ServantAttendanceNavigation } from '@/components/servant-attendance-navigation'
import { SundaySchoolServantsMeetings } from '@/components/sunday-school-servants-meetings'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolDashboard } from '@/lib/swr'
import { elementaryMeetingGroups } from '@/lib/sunday-school-meeting-groups'
import type { SundaySchoolDashboard } from '@/types/sunday-school'

function MeetingsContent() {
  const { status, hasAccess } = useSundaySchoolGuard()
  const params = useSearchParams()
  const router = useRouter()
  const { data, isLoading, error, mutate } = useSundaySchoolDashboard()
  const groups = elementaryMeetingGroups(data as SundaySchoolDashboard | undefined)
  const group = groups.find(item => item.id === params.get('ageGroupId')) ?? groups[0]
  const initialMeetingId = params.get('meetingId') || undefined

  if (status !== 'authenticated' || !hasAccess || isLoading) return <PageLoading />

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Servants meetings" meta={['Elementary School', 'Meeting sessions and attendance']} />
      <ServantAttendanceNavigation active="meetings" />
      {error ? (
        <Panel bodyClassName="p-4">
          <p role="alert" className="text-sm text-bad">Could not load your meeting groups.</p>
          <Button variant="outline" className="mt-3" onClick={() => mutate()}>Try again</Button>
        </Panel>
      ) : !group ? (
        <Panel><EmptyState message="Servants meetings are available to Elementary school servants. Ask your coordinator if your Elementary assignment is missing." /></Panel>
      ) : (
        <Panel title={group.name} bodyClassName="p-4">
          {groups.length > 1 && (
            <div className="mb-4 space-y-2">
              <Label htmlFor="meeting-age-group">School group</Label>
              <select id="meeting-age-group" value={group.id} className="h-9 w-full rounded-md border border-line bg-surface px-3 text-sm"
                onChange={event => router.push(`/dashboard/servants/servant-attendance/meetings?${new URLSearchParams({ ageGroupId: event.target.value })}`)}>
                {groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          )}
          <SundaySchoolServantsMeetings key={`${group.id}-${initialMeetingId ?? ''}`} ageGroupId={group.id} initialMeetingId={initialMeetingId} />
        </Panel>
      )}
    </div>
  )
}

export default function ServantsMeetingsPage() {
  return <Suspense fallback={<PageLoading />}><MeetingsContent /></Suspense>
}
