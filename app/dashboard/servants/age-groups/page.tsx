'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { KeyValueList } from '@/components/ds/kv-list'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import { useSundaySchoolAgeGroups, usePriestOverseers } from '@/lib/swr'
import { getLevelDisplayName, LEVEL_ORDER } from '@/lib/sunday-school-class'
import type { SundaySchoolAgeGroup } from '@/types/sunday-school'
import { SundaySchoolAuthority, SundaySchoolLevel } from '@prisma/client'
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react'

interface CoordinatorOption {
  id: string
  name: string
  email: string
  role: string
}

/**
 * Age groups (Elementary / Middle / High) are data, not an enum, so the church
 * can redraw them without a migration. A class's band is whichever group lists
 * its grade — so moving a grade here re-parents its classes and hands them to
 * a different coordinator.
 */
export default function SundaySchoolAgeGroupsPage() {
  const { status, session } = useSundaySchoolGuard()
  const { data: priests, error: priestsError, isLoading: priestsLoading } = usePriestOverseers(
    session?.user?.role === 'SUPER_ADMIN'
  )
  const { data, isLoading, mutate } = useSundaySchoolAgeGroups()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [overseerId, setOverseerId] = useState('')
  const [levels, setLevels] = useState<SundaySchoolLevel[]>([])
  const [isElementary, setIsElementary] = useState(false)
  const [saving, setSaving] = useState(false)
  const [coordinatorOptions, setCoordinatorOptions] = useState<CoordinatorOption[]>([])
  const [selectedCoordinatorId, setSelectedCoordinatorId] = useState('')
  const [coordinatorsLoading, setCoordinatorsLoading] = useState(false)
  const [coordinatorsError, setCoordinatorsError] = useState(false)
  const [coordinatorSaving, setCoordinatorSaving] = useState(false)

  const ageGroups = (data as SundaySchoolAgeGroup[] | undefined) ?? []
  const editingGroup = ageGroups.find(group => group.id === editingId)
  const coordinators = (editingGroup?.assignments ?? []).filter(
    assignment => assignment.ageGroupId === editingId
  )
  const assignedCoordinatorIds = new Set(coordinators.map(assignment => assignment.userId))
  const availableCoordinatorOptions = coordinatorOptions.filter(
    option => !assignedCoordinatorIds.has(option.id)
  )

  // Levels another band already owns cannot be picked here.
  const claimedElsewhere = new Set(
    ageGroups.filter(group => group.id !== editingId).flatMap(group => group.levels)
  )

  useEffect(() => {
    if (!dialogOpen || !editingId || session?.user?.role !== 'SUPER_ADMIN') return

    let active = true
    setCoordinatorsLoading(true)
    setCoordinatorsError(false)

    fetch('/api/sunday-school/assignable-servants')
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load eligible coordinators')
        return response.json()
      })
      .then(users => {
        if (active) setCoordinatorOptions(Array.isArray(users) ? users : [])
      })
      .catch(() => {
        if (active) {
          setCoordinatorOptions([])
          setCoordinatorsError(true)
        }
      })
      .finally(() => {
        if (active) setCoordinatorsLoading(false)
      })

    return () => {
      active = false
    }
  }, [dialogOpen, editingId, session?.user?.role])

  const openCreate = () => {
    setEditingId(null)
    setName('')
    setOverseerId('')
    setLevels([])
    setIsElementary(false)
    setSelectedCoordinatorId('')
    setDialogOpen(true)
  }

  const openEdit = (group: SundaySchoolAgeGroup) => {
    setEditingId(group.id)
    setName(group.name)
    setOverseerId(group.overseerId ?? '')
    setLevels(group.levels)
    setIsElementary(group.isElementary)
    setSelectedCoordinatorId('')
    setDialogOpen(true)
  }

  const toggleLevel = (level: SundaySchoolLevel) => {
    setLevels(previous =>
      previous.includes(level)
        ? previous.filter(current => current !== level)
        : [...previous, level]
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const url = editingId
        ? `/api/sunday-school/age-groups/${editingId}`
        : '/api/sunday-school/age-groups'
      const response = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, levels, overseerId: overseerId || null, isElementary }),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error || 'Failed to save the age group')
      }

      toast.success(editingId ? 'Age group updated' : 'Age group created', {
        description: new Date().toLocaleString(),
      })
      setDialogOpen(false)
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the age group')
    } finally {
      setSaving(false)
    }
  }

  const handleAssignCoordinator = async () => {
    if (!editingId || !selectedCoordinatorId) return

    setCoordinatorSaving(true)
    try {
      const response = await fetch('/api/sunday-school/servant-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedCoordinatorId,
          ageGroupId: editingId,
          authority: SundaySchoolAuthority.COORDINATOR,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(body.error || 'Failed to assign the coordinator')
      }

      toast.success('Age-group coordinator assigned', {
        description: new Date().toLocaleString(),
      })
      setSelectedCoordinatorId('')
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign the coordinator')
    } finally {
      setCoordinatorSaving(false)
    }
  }

  const handleRemoveCoordinator = async (assignmentId: string) => {
    setCoordinatorSaving(true)
    try {
      const response = await fetch(
        `/api/sunday-school/servant-assignments?id=${assignmentId}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Failed to remove the coordinator')
      }

      toast.success('Age-group coordinator removed')
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove the coordinator')
    } finally {
      setCoordinatorSaving(false)
    }
  }

  const handleDelete = async (group: SundaySchoolAgeGroup) => {
    if (
      !confirm(
        `Delete ${group.name}? Its coordinator assignments are removed. The classes themselves are kept, but become unbanded until another group claims their grades.`
      )
    ) {
      return
    }

    try {
      const response = await fetch(`/api/sunday-school/age-groups/${group.id}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error || 'Failed to delete the age group')
      }
      toast.success('Age group deleted')
      await mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete the age group')
    }
  }

  if (status === 'loading' || isLoading) {
    return <PageLoading />
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Age groups"
          meta={['Which grades belong to each band; a band’s coordinator runs every class in it']}
          actions={
            <Button onClick={openCreate}>
              <Plus />
              New age group
            </Button>
          }
        />

        {ageGroups.length === 0 ? (
          <Panel>
            <EmptyState message="No age groups yet. Create one to group classes into bands." />
          </Panel>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ageGroups.map((group) => {
              const groupCoordinators = (group.assignments ?? []).filter((assignment) => assignment.ageGroupId === group.id)
              return (
                <Panel
                  key={group.id}
                  title={group.name}
                  description={[...group.levels].sort((a, b) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b)).map((level) => getLevelDisplayName(level)).join(' · ') || 'No grades yet'}
                  actions={
                    <span className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${group.name}`} onClick={() => openEdit(group)}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${group.name}`} className="hover:text-bad" onClick={() => handleDelete(group)}>
                        <Trash2 />
                      </Button>
                    </span>
                  }
                  bodyClassName="px-4 py-1"
                >
                  <KeyValueList
                    items={[
                      {
                        label: 'Coordinator',
                        value:
                          groupCoordinators.length > 0 ? (
                            groupCoordinators.map((a) => a.user.name).join(', ')
                          ) : (
                            <span className="text-ink-3">No coordinator assigned</span>
                          ),
                      },
                      { label: 'Priest overseer', value: group.overseer?.name ?? <span className="text-ink-3">Not assigned</span> },
                      { label: 'Homework', value: group.isElementary ? 'Elementary homework enabled' : 'Not enabled' },
                    ]}
                  />
                </Panel>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit age group' : 'New age group'}</DialogTitle>
            <DialogDescription>
              Pick the grades this band covers. A grade can belong to only one band.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ag-name">Name</Label>
              <Input
                id="ag-name"
                value={name}
                placeholder="e.g. High School"
                onChange={event => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ag-overseer">Priest overseer</Label>
              <select
                id="ag-overseer"
                value={overseerId}
                onChange={event => setOverseerId(event.target.value)}
                disabled={priestsLoading || !!priestsError}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">No priest assigned</option>
                {overseerId &&
                  !priests?.some(priest => priest.id === overseerId && !priest.isDisabled) && (
                    <option value={overseerId} disabled>
                      Current overseer unavailable — choose another priest
                    </option>
                  )}
                {(priests ?? [])
                  .filter(priest => !priest.isDisabled)
                  .map(priest => (
                    <option key={priest.id} value={priest.id}>
                      {priest.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                The same priest can oversee multiple age groups. Oversight does not grant editing
                permissions.
              </p>
              {priestsError && (
                <p role="alert" className="text-sm text-red-600">
                  Unable to load priests. Reopen this page to try again.
                </p>
              )}
            </div>

            {editingId && (
              <div className="space-y-2 border-t pt-4 dark:border-gray-800">
                <Label htmlFor="ag-coordinator">Age-group coordinators</Label>
                {coordinators.length > 0 ? (
                  <div className="space-y-2">
                    {coordinators.map(assignment => (
                      <div
                        key={assignment.id}
                        className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 dark:border-gray-700"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{assignment.user.name}</p>
                          {assignment.user.email && (
                            <p className="truncate text-xs text-muted-foreground">
                              {assignment.user.email}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${assignment.user.name} as age-group coordinator`}
                          disabled={coordinatorSaving}
                          onClick={() => handleRemoveCoordinator(assignment.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No coordinator assigned.</p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    id="ag-coordinator"
                    value={selectedCoordinatorId}
                    onChange={event => setSelectedCoordinatorId(event.target.value)}
                    disabled={coordinatorsLoading || coordinatorsError || coordinatorSaving}
                    className="flex h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">
                      {coordinatorsLoading ? 'Loading eligible servants…' : 'Select a servant…'}
                    </option>
                    {availableCoordinatorOptions.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.name} ({option.email})
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!selectedCoordinatorId || coordinatorSaving}
                    onClick={handleAssignCoordinator}
                  >
                    <UserPlus className="mr-1 h-4 w-4" />
                    {coordinatorSaving ? 'Saving…' : 'Assign'}
                  </Button>
                </div>
                {coordinatorsError && (
                  <p role="alert" className="text-sm text-red-600">
                    Unable to load eligible coordinators. Close and reopen this dialog to try again.
                  </p>
                )}
                {!coordinatorsLoading &&
                  !coordinatorsError &&
                  availableCoordinatorOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Every eligible servant is already assigned to this age group.
                    </p>
                  )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Grades</Label>
              <div className="grid grid-cols-2 gap-2">
                {LEVEL_ORDER.map(level => {
                  const taken = claimedElsewhere.has(level)
                  return (
                    <label
                      key={level}
                      className={`flex items-center gap-2 text-sm ${taken ? 'text-gray-400' : ''}`}
                    >
                      <input
                        type="checkbox"
                        disabled={taken}
                        checked={levels.includes(level)}
                        onChange={() => toggleLevel(level)}
                      />
                      {getLevelDisplayName(level)}
                      {taken && <span className="text-xs">(taken)</span>}
                    </label>
                  )
                })}
              </div>
            </div>
            <label className="flex items-start gap-3 rounded-md border border-line p-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-brand"
                checked={isElementary}
                onChange={event => setIsElementary(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-ink">Elementary band</span>
                <span className="block text-xs text-ink-3">
                  Enables the Homework workflow for every grade assigned to this band. Only one band can be Elementary.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={
                saving ||
                coordinatorSaving ||
                priestsLoading ||
                !!priestsError ||
                !name.trim() ||
                levels.length === 0
              }
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
