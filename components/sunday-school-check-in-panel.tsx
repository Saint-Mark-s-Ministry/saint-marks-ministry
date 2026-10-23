'use client'

import { useState } from 'react'
import { Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Panel } from '@/components/ds/panel'
import { Segmented } from '@/components/ds/segmented'
import { StatusBadge } from '@/components/ds/status-badge'
import { Button } from '@/components/ui/button'
import { StudentName } from '@/components/student-history-provider'
import { EmptyState } from '@/components/ui/empty-state'
import { useSundaySchoolCheckIns } from '@/lib/swr'
import { SundaySchoolCallDialog, CALL_OUTCOME_LABELS } from '@/components/sunday-school-call-dialog'
import { formatDateUTC } from '@/lib/utils'

type View = 'all' | 'mine' | 'unassigned' | 'not-called'

export function SundaySchoolCheckInPanel({ classId }: { classId?: string }) {
  const { data, error, isLoading, mutate } = useSundaySchoolCheckIns(classId)
  const [view, setView] = useState<View>('all')
  const [callChild, setCallChild] = useState<{ id: string; name: string; canEdit: boolean } | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const children = error ? [] : (data?.classes ?? []).flatMap(cls => cls.children.map(child => ({ ...child, classroom: cls })))
  const mine = children.filter(child => child.assignee?.id === data?.viewerId)
  const unassigned = children.filter(child => !child.assignmentId)
  const notCalled = children.filter(child => !child.callThisWeek)
  const listed = view === 'mine' ? mine : view === 'unassigned' ? unassigned : view === 'not-called' ? notCalled : children

  async function assign(childId: string, assignmentId: string) {
    setSaving(childId)
    try {
      const response = await fetch('/api/sunday-school/follow-up-assignments', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ childId, assignmentId: assignmentId || null }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Could not save the assignment')
      await mutate()
      toast.success(assignmentId ? 'Check-in servant assigned' : 'Check-in assignment cleared')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not save the assignment')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <Panel
        title="Assigned check-ins"
        description={`One servant per child · ${data ? `Week of ${formatDateUTC(data.weekOf, { year: undefined, weekday: undefined })}` : 'This week'} · Monday–Sunday. All call outcomes count as an attempt.`}
        toolbar={
          <Segmented<View>
            label="Check-in filter" value={view} onChange={setView}
            options={[
              { value: 'all', label: 'All children', count: children.length },
              { value: 'mine', label: 'Mine', count: mine.length },
              { value: 'unassigned', label: 'Unassigned', count: unassigned.length },
              { value: 'not-called', label: 'Not called this week', count: notCalled.length },
            ]}
          />
        }
      >
        {error ? (
          <div className="p-4" role="alert">
            <p className="text-sm">Couldn’t load check-in assignments.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void mutate()}>Try again</Button>
          </div>
        ) : isLoading ? (
          <p className="p-4 text-sm text-ink-3" role="status">Loading check-ins…</p>
        ) : listed.length === 0 ? (
          <EmptyState message={view === 'mine' ? 'No children are assigned to you in this class view.' : view === 'not-called' && children.length ? 'Every child has a call logged this week.' : 'No children match this filter.'} />
        ) : (
          <ul className="divide-y divide-line">
            {listed.map(child => {
              const name = `${child.firstName} ${child.lastName}`
              return (
                <li key={child.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <StudentName id={child.id} name={name} program="sunday-school" className="block text-sm" />
                    {!classId && <p className="text-xs text-ink-3">{child.classroom.name}</p>}
                    <StatusBadge tone={child.callThisWeek ? 'ok' : 'warn'}>
                      {child.callThisWeek ? 'Called this week' : 'No call logged this week'}
                    </StatusBadge>
                    {child.callThisWeek && <p className="text-xs text-ink-3">{formatDateUTC(child.callThisWeek.calledAt, { year: undefined })} · {CALL_OUTCOME_LABELS[child.callThisWeek.outcome]}</p>}
                  </div>
                  <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:w-auto">
                    {child.classroom.canAssign ? (
                      <label className="flex min-w-0 flex-col gap-1.5 text-xs text-ink-3">
                        Check-in servant
                        <select
                          aria-label={`Check-in servant for ${name}`}
                          className="h-11 w-full min-w-0 rounded-md border border-line-strong bg-surface px-3 text-[15px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink disabled:opacity-50 md:h-8 md:text-[13px] sm:w-48"
                          value={child.assignmentId ?? ''}
                          disabled={saving !== null}
                          onChange={event => void assign(child.id, event.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {child.classroom.servants.map(servant => <option key={servant.assignmentId} value={servant.assignmentId}>{servant.name}</option>)}
                        </select>
                      </label>
                    ) : <span className="text-sm text-ink-3">{child.assignee?.name ?? 'Unassigned'}</span>}
                    <Button variant="outline" onClick={() => setCallChild({ id: child.id, name, canEdit: child.classroom.canAssign })}>
                      <Phone aria-hidden />{child.classroom.canAssign ? 'Log call' : 'Call history'}
                    </Button>
                    {saving === child.id && <span role="status" className="text-xs text-ink-3">Saving…</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    {callChild && data && !error && children.some(child => child.id === callChild.id) && (
      <SundaySchoolCallDialog key={callChild.id} child={{ ...callChild, canEdit: children.find(child => child.id === callChild.id)?.classroom.canAssign ?? false }} viewerId={data.viewerId} onClose={() => setCallChild(null)} onSaved={() => mutate()} />
    )}
    </>
  )
}
