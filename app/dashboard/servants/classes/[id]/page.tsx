'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KpiStrip } from '@/components/ds/kpi-strip'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolClass } from '@/lib/swr'
import { getChildFullName, getLevelDisplayName } from '@/lib/sunday-school-class'
import { formatDateUTC } from '@/lib/utils'
import type {
  SundaySchoolAssignmentRow,
  SundaySchoolChild,
  SundaySchoolClass,
  SundaySchoolSession,
  SundaySchoolWeeklyLesson,
} from '@/types/sunday-school'
import { SundaySchoolAuthority } from '@prisma/client'
import { ClipboardList, ExternalLink, Trash2, UserPlus } from 'lucide-react'

interface ServantOption {
  id: string
  name: string
  email: string
  role: string
}

interface ClassDetail extends SundaySchoolClass {
  children: SundaySchoolChild[]
  sessions: SundaySchoolSession[]
  weeklyLessons: SundaySchoolWeeklyLesson[]
  canServe: boolean
  canCoordinate: boolean
  canDelete: boolean
  canTakeServantAttendance: boolean
  canViewServantAttendance: boolean
}

export default function SundaySchoolClassDetailPage() {
  const params = useParams<{ id: string }>()
  const classId = params?.id
  const router = useRouter()
  const { status } = useSundaySchoolGuard()
  const { data, error: loadError, isLoading, mutate } = useSundaySchoolClass(classId)

  const [servantOptions, setServantOptions] = useState<ServantOption[]>([])
  const [servantSearch, setServantSearch] = useState('')
  const [selectedServantId, setSelectedServantId] = useState('')
  const [asCoordinator, setAsCoordinator] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const detail = data as ClassDetail | undefined
  const canCoordinate = detail?.canCoordinate ?? false

  // Only someone who can staff this class needs the picker's options. This
  // endpoint exists precisely so a coordinator who is a plain servant does not
  // need /api/users, which is admin-only.
  useEffect(() => {
    if (!canCoordinate) return
    fetch('/api/sunday-school/assignable-servants')
      .then(res => (res.ok ? res.json() : []))
      .then(users => setServantOptions(Array.isArray(users) ? users : []))
      .catch(() => setServantOptions([]))
  }, [canCoordinate])

  const handleAssign = async () => {
    if (!selectedServantId || !classId) return

    setAssigning(true)
    try {
      const res = await fetch('/api/sunday-school/servant-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedServantId,
          classId,
          authority: asCoordinator
            ? SundaySchoolAuthority.COORDINATOR
            : SundaySchoolAuthority.SERVANT,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to assign the servant')
      }

      toast.success('Servant assigned', { description: new Date().toLocaleString() })
      setServantSearch('')
      setSelectedServantId('')
      setAsCoordinator(false)
      mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign the servant')
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassign = async (assignmentId: string) => {
    try {
      const res = await fetch(`/api/sunday-school/servant-assignments?id=${assignmentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to remove the servant')
      }
      toast.success('Servant removed')
      mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove the servant')
    }
  }

  const handleChangeRole = async (
    assignment: SundaySchoolAssignmentRow,
    authority: SundaySchoolAuthority
  ) => {
    if (!classId) return

    setChangingRoleId(assignment.id)
    try {
      const res = await fetch('/api/sunday-school/servant-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: assignment.userId,
          classId,
          authority,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to change the servant role')
      }

      toast.success(
        authority === SundaySchoolAuthority.COORDINATOR
          ? `${assignment.user.name} is now a coordinator`
          : `Coordinator role removed from ${assignment.user.name}`
      )
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to change the servant role')
    } finally {
      setChangingRoleId(null)
    }
  }

  const handleDelete = async () => {
    if (!classId) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/sunday-school/classes/${classId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to delete the class')
      }

      setDeleteDialogOpen(false)
      toast.success('Class deleted', {
        description: 'The children were preserved and moved to Unassigned.',
      })
      router.push('/dashboard/servants/classes')
      router.refresh()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the class')
    } finally {
      setDeleting(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  if (!detail) {
    return (
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader back={{ href: '/dashboard/servants/classes', label: 'All classes' }} title="Class" />
        <Panel>
          {(loadError as { status?: number } | undefined)?.status && (loadError as { status: number }).status >= 500 ? (
            <EmptyState
              title="Couldn’t load this class"
              message="Something went wrong on our side. Try again in a moment."
              action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>}
            />
          ) : (
            <EmptyState message="This class could not be found, or you do not have access to it." />
          )}
        </Panel>
      </div>
    )
  }

  const classAssignments = (detail.assignments ?? []).filter(
    (a: SundaySchoolAssignmentRow) => a.classId === detail.id
  )
  const assignedIds = new Set(classAssignments.map(a => a.userId))
  const availableServants = servantOptions.filter(s => !assignedIds.has(s.id))
  const normalizedServantSearch = servantSearch.trim().toLocaleLowerCase()
  const filteredServants = normalizedServantSearch
    ? availableServants.filter(servant =>
        `${servant.name} ${servant.email}`.toLocaleLowerCase().includes(normalizedServantSearch)
      )
    : availableServants

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader
          back={{ href: '/dashboard/servants/classes', label: 'All classes' }}
          title={detail.name}
          meta={[getLevelDisplayName(detail.level), `${detail.children.length} children`]}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/dashboard/servants/lessons">Lessons</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/dashboard/servants/roster?classId=${detail.id}`}>
                  <ClipboardList />
                  Roster
                </Link>
              </Button>
              {detail.canServe && (
                <Button asChild>
                  <Link href={`/dashboard/servants/attendance?classId=${detail.id}`}>
                    Take attendance
                  </Link>
                </Button>
              )}
              {detail.canViewServantAttendance && (
                <Button asChild variant="outline">
                  <Link href={`/dashboard/servants/servant-attendance?classId=${detail.id}`}>
                    Servant attendance
                  </Link>
                </Button>
              )}
              {detail.canDelete && (
                <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                  <Trash2 />
                  Delete class
                </Button>
              )}
            </div>
          }
        />

        <AlertDialog
          open={deleteDialogOpen}
          onOpenChange={open => {
            if (!deleting) setDeleteDialogOpen(open)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {detail.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the class and its class-specific history, including servant
                assignments, attendance sessions, weekly lessons, visitations, and roster imports.{' '}
                {detail.children.length}{' '}
                {detail.children.length === 1 ? 'child' : 'children'} on the roster will be preserved
                and moved to Unassigned. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-bad text-white hover:bg-bad/90"
                disabled={deleting}
                onClick={event => {
                  event.preventDefault()
                  void handleDelete()
                }}
              >
                {deleting ? 'Deleting…' : 'Delete class'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <KpiStrip
          items={[
            { label: 'Children', value: detail.children.filter((c) => c.isActive).length, hint: 'on roster' },
            {
              label: 'Servants',
              value: classAssignments.length,
              hint: `${classAssignments.filter((a) => a.authority === SundaySchoolAuthority.COORDINATOR).length} coordinator`,
            },
            { label: 'Sessions', value: detail.sessions.length, hint: 'attendance taken' },
            {
              label: 'Latest session',
              value: <span className="text-[22px]">{detail.sessions[0] ? formatDateUTC(detail.sessions[0].date, { weekday: undefined, year: undefined }) : '—'}</span>,
              hint: detail.sessions[0] ? `${detail.sessions[0]._count?.attendance ?? 0} marked` : 'none yet',
            },
          ]}
        />

        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5 xl:order-2">
        <Panel title="Servants" bodyClassName="flex flex-col gap-4 px-4 py-3">
            {classAssignments.length === 0 ? (
              <EmptyState message="No servants assigned to this class yet." />
            ) : (
              <div className="divide-y divide-line">
                {classAssignments.map(assignment => (
                  <div key={assignment.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Initials name={assignment.user.name} imageUrl={assignment.user.profileImageUrl} />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[13.5px] font-medium text-ink">{assignment.user.name}</span>
                        <span className="truncate text-xs text-ink-3">{assignment.user.email}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {assignment.authority === SundaySchoolAuthority.COORDINATOR && (
                        <StatusBadge tone="gold" dot={false}>Coordinator</StatusBadge>
                      )}
                      {canCoordinate && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={changingRoleId === assignment.id}
                            onClick={() => handleChangeRole(
                              assignment,
                              assignment.authority === SundaySchoolAuthority.COORDINATOR
                                ? SundaySchoolAuthority.SERVANT
                                : SundaySchoolAuthority.COORDINATOR
                            )}
                          >
                            {changingRoleId === assignment.id
                              ? 'Saving…'
                              : assignment.authority === SundaySchoolAuthority.COORDINATOR
                                ? 'Make servant'
                                : 'Make coordinator'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove ${assignment.user.name} from class`}
                            className="hover:text-bad"
                            onClick={() => handleUnassign(assignment.id)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canCoordinate && (
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="servant-search">Assign a servant</Label>
                  <div className="grid gap-2">
                    <Input
                      id="servant-search"
                      type="search"
                      value={servantSearch}
                      placeholder="Search by name or email…"
                      onChange={event => {
                        setServantSearch(event.target.value)
                        setSelectedServantId('')
                      }}
                    />
                    <select
                      id="servant"
                      aria-label="Servant"
                      value={selectedServantId}
                      onChange={e => setSelectedServantId(e.target.value)}
                      className="h-11 w-full rounded-md border border-line-strong bg-surface px-2.5 text-base text-ink md:h-9 md:text-[13.5px]"
                    >
                      <option value="">
                        {normalizedServantSearch
                          ? `Select from ${filteredServants.length} matches…`
                          : 'Select a servant…'}
                      </option>
                      {filteredServants.map(servant => (
                        <option key={servant.id} value={servant.id}>
                          {servant.name} ({servant.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  {normalizedServantSearch && filteredServants.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No available servants match that search.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                <label className="flex min-h-11 items-center gap-2 text-[13px] text-ink-2 md:min-h-8">
                  <input
                    type="checkbox"
                    checked={asCoordinator}
                    onChange={e => setAsCoordinator(e.target.checked)}
                    className="size-4 accent-brand"
                  />
                  As coordinator
                </label>
                <Button onClick={handleAssign} disabled={!selectedServantId || assigning}>
                  <UserPlus />
                  {assigning ? 'Assigning…' : 'Assign'}
                </Button>
                </div>
              </div>
            )}
        </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5 xl:order-1">
        <Panel
          title="Roster"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/servants/roster?classId=${detail.id}`}>Open roster</Link>
            </Button>
          }
          bodyClassName="px-4 py-2"
        >
            {detail.children.length === 0 ? (
              <EmptyState message="No children on this roster yet." />
            ) : (
              <ul className="grid gap-x-6 sm:grid-cols-2">
                {detail.children.map(child => (
                  <li key={child.id} className="flex items-center gap-2.5 border-b border-line py-2">
                    <Initials name={getChildFullName(child)} />
                    <span className={`truncate text-[13.5px] ${child.isActive ? 'text-ink' : 'text-ink-3 line-through'}`}>
                      {getChildFullName(child)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </Panel>

        <Panel title="Recent sessions" bodyClassName="px-4 py-1">
            {detail.sessions.length === 0 ? (
              <EmptyState message="No attendance has been taken for this class yet." />
            ) : (
              <div className="divide-y divide-line">
                {detail.sessions.slice(0, 12).map(sessionItem => {
                  const lesson = detail.weeklyLessons?.find(item => item.sundayDate.slice(0, 10) === sessionItem.date.slice(0, 10))
                  return (
                    <div key={sessionItem.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{formatDateUTC(sessionItem.date)}</p>
                        {(lesson?.title || sessionItem.topic) && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                            {lesson?.title || sessionItem.topic}
                          </p>
                        )}
                        {lesson && lesson.resources.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-3">
                            {lesson.resources.map(resource => (
                              <a key={resource.id} href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-accent-ink hover:underline dark:text-maroon-300">
                                <ExternalLink className="h-3.5 w-3.5" /> {resource.title}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400 shrink-0">
                        {sessionItem._count?.attendance ?? 0} marked
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
        </Panel>
        </div>
        </div>
      </div>
    </div>
  )
}
