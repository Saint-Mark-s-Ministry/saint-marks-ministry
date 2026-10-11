'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolClasses, useSundaySchoolDashboard } from '@/lib/swr'
import {
  compareAgeGroupsByLevel,
  compareClassesByLevelAndName,
  findAgeGroupForLevel,
  getLevelDisplayName,
  LEVEL_ORDER,
} from '@/lib/sunday-school-class'
import type { SundaySchoolClass, SundaySchoolDashboard } from '@/types/sunday-school'
import { SundaySchoolLevel } from '@prisma/client'
import { Pencil, Plus, Users } from 'lucide-react'

const UNBANDED = '__unbanded__'

export default function SundaySchoolClassesPage() {
  const { status } = useSundaySchoolGuard()
  const { data, isLoading, mutate } = useSundaySchoolClasses()
  // The dashboard reports which bands this person coordinates, which is what
  // decides whether they may open a new class and at which grade levels.
  const { data: dashboardData } = useSundaySchoolDashboard()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingClass, setEditingClass] = useState<SundaySchoolClass | null>(null)
  const [editName, setEditName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [form, setForm] = useState<{ name: string; level: SundaySchoolLevel | '' }>({
    name: '',
    level: '',
  })

  const dashboard = dashboardData as SundaySchoolDashboard | undefined
  const isAdmin = dashboard?.standing.isAdmin ?? false
  // Levels this person may create a class at: everything for an admin, or the
  // levels of the bands they coordinate.
  const creatableLevels = isAdmin
    ? LEVEL_ORDER
    : (dashboard?.ageGroups ?? []).filter(g => g.canCoordinate).flatMap(g => g.levels)
  const canManage = creatableLevels.length > 0

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/sunday-school/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to create the class')
      }

      toast.success('Class created', { description: new Date().toLocaleString() })
      setDialogOpen(false)
      setForm({ name: '', level: '' })
      mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to create the class')
    } finally {
      setSaving(false)
    }
  }

  const openRenameDialog = (classItem: SundaySchoolClass) => {
    setEditingClass(classItem)
    setEditName(classItem.name)
  }

  const handleRename = async () => {
    if (!editingClass) return

    setRenaming(true)
    try {
      const res = await fetch(`/api/sunday-school/classes/${editingClass.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to rename the class')
      }

      toast.success('Class name updated', { description: new Date().toLocaleString() })
      setEditingClass(null)
      setEditName('')
      mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to rename the class')
    } finally {
      setRenaming(false)
    }
  }

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  const classes = (data as SundaySchoolClass[] | undefined) ?? []
  const ageGroups = [...(dashboard?.ageGroups ?? [])].sort(compareAgeGroupsByLevel)
  const groupedClasses = new Map<string, { name: string; classes: SundaySchoolClass[] }>()

  for (const cls of classes) {
    const ageGroup = findAgeGroupForLevel(cls.level, ageGroups)
    const key = ageGroup?.id ?? UNBANDED
    if (!groupedClasses.has(key)) {
      groupedClasses.set(key, {
        name: ageGroup?.name ?? 'Other classes',
        classes: [],
      })
    }
    groupedClasses.get(key)!.classes.push(cls)
  }

  for (const group of groupedClasses.values()) {
    group.classes.sort(compareClassesByLevelAndName)
  }

  const ageGroupOrder = new Map(ageGroups.map((group, index) => [group.id, index]))
  const classGroups = Array.from(groupedClasses.entries()).sort(([leftId], [rightId]) =>
    (ageGroupOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
    (ageGroupOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER)
  )

  return (
    <div className="content-reveal flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Classes"
          meta={['Classes, their servants, and their rosters', `${classes.length} classes`]}
          actions={
            canManage ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus />
                New class
              </Button>
            ) : undefined
          }
        />

        {classes.length === 0 ? (
          <Panel>
            <EmptyState message={canManage ? 'No classes yet. Create the first one to get started.' : 'You are not assigned to a Sunday School class yet.'} />
          </Panel>
        ) : (
          classGroups.map(([groupId, group]) => (
            <Panel key={groupId} title={group.name} description={`${group.classes.length} ${group.classes.length === 1 ? 'class' : 'classes'}`}>
              <ul className="divide-y divide-line">
                {group.classes.map((cls) => (
                  <li key={cls.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_90px_90px_auto]">
                    <span className="flex min-w-0 flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <Link href={`/dashboard/servants/classes/${cls.id}`} className="font-medium text-ink no-underline hover:underline">
                          {cls.name}
                        </Link>
                        {!cls.isActive && <StatusBadge tone="neutral">Inactive</StatusBadge>}
                      </span>
                      <span className="text-xs text-ink-3 md:hidden">
                        {getLevelDisplayName(cls.level)} · {cls._count?.children ?? 0} children · {cls.assignments.length} servants
                      </span>
                    </span>
                    <span className="hidden text-[13px] text-ink-2 md:block">{getLevelDisplayName(cls.level)}</span>
                    <span className="tabular hidden text-[13px] md:block">{cls._count?.children ?? 0} children</span>
                    <span className="tabular hidden text-[13px] text-ink-2 md:block">{cls.assignments.length} servants</span>
                    <span className="flex items-center gap-1">
                      {cls.canCoordinate && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${cls.name} name`} onClick={() => openRenameDialog(cls)}>
                          <Pencil />
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/servants/classes/${cls.id}`}>
                          <Users />
                          Open
                        </Link>
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Sunday School class</DialogTitle>
            <DialogDescription>
              Give the class a name and pick the grade level it serves.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Class name</Label>
              <Input
                id="name"
                value={form.name}
                placeholder="e.g. Grade 3 Boys"
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Grade level</Label>
              <select
                id="level"
                value={form.level}
                onChange={e => setForm(prev => ({ ...prev, level: e.target.value as SundaySchoolLevel }))}
                className="h-11 w-full rounded-md border border-line-strong bg-surface px-2.5 text-base text-ink md:h-9 md:text-[13.5px]"
              >
                <option value="">Select a grade…</option>
                {creatableLevels.map(level => (
                  <option key={level} value={level}>
                    {getLevelDisplayName(level)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.level}>
              {saving ? 'Creating…' : 'Create class'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingClass !== null}
        onOpenChange={open => {
          if (!open && !renaming) {
            setEditingClass(null)
            setEditName('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit class name</DialogTitle>
            <DialogDescription>
              Update the name shown throughout Sunday School for this class.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault()
              void handleRename()
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="edit-class-name">Class name</Label>
              <Input
                id="edit-class-name"
                value={editName}
                autoFocus
                onChange={event => setEditName(event.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={renaming}
                onClick={() => {
                  setEditingClass(null)
                  setEditName('')
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  renaming ||
                  !editName.trim() ||
                  editName.trim() === editingClass?.name
                }
              >
                {renaming ? 'Saving…' : 'Save name'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
