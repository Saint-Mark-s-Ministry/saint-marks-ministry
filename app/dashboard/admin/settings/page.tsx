'use client'

import { useEffect, useState } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { StatusBadge } from '@/components/ds/status-badge'
import { isAdmin } from '@/lib/roles'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'

interface AcademicYear {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  _count?: {
    lessons: number
    exams: number
  }
}

export default function SettingsPage() {
  const { status } = useAdminGuard(isAdmin)

  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedYear, setSelectedYear] = useState<AcademicYear | null>(null)

  // Form states
  const [formName, setFormName] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formIsActive, setFormIsActive] = useState(false)

  useEffect(() => {
    fetchAcademicYears()
  }, [])

  const fetchAcademicYears = async () => {
    try {
      const res = await fetch('/api/academic-years')
      if (res.ok) {
        const data = await res.json()
        setAcademicYears(data)
      }
    } catch {
      toast.error('Failed to load academic years')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormStartDate('')
    setFormEndDate('')
    setFormIsActive(false)
  }

  const openCreateDialog = () => {
    resetForm()
    // Suggest next year name based on existing years
    const currentYear = new Date().getFullYear()
    const suggestedName = `${currentYear}-${currentYear + 1}`
    setFormName(suggestedName)
    setFormStartDate(`${currentYear}-09-01`)
    setFormEndDate(`${currentYear + 1}-06-30`)
    setShowCreateDialog(true)
  }

  const openEditDialog = (year: AcademicYear) => {
    setSelectedYear(year)
    setFormName(year.name)
    setFormStartDate(year.startDate.split('T')[0])
    setFormEndDate(year.endDate.split('T')[0])
    setFormIsActive(year.isActive)
    setShowEditDialog(true)
  }

  const openDeleteDialog = (year: AcademicYear) => {
    setSelectedYear(year)
    setShowDeleteDialog(true)
  }

  const handleCreate = async () => {
    if (!formName || !formStartDate || !formEndDate) {
      toast.error('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/academic-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          startDate: formStartDate,
          endDate: formEndDate,
          isActive: formIsActive,
        }),
      })

      if (res.ok) {
        toast.success('Academic year created successfully')
        setShowCreateDialog(false)
        fetchAcademicYears()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create academic year')
      }
    } catch {
      toast.error('Failed to create academic year')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async () => {
    if (!selectedYear || !formName || !formStartDate || !formEndDate) {
      toast.error('Please fill in all required fields')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/academic-years/${selectedYear.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          startDate: formStartDate,
          endDate: formEndDate,
          isActive: formIsActive,
        }),
      })

      if (res.ok) {
        toast.success('Academic year updated successfully')
        setShowEditDialog(false)
        fetchAcademicYears()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to update academic year')
      }
    } catch {
      toast.error('Failed to update academic year')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedYear) return

    setSaving(true)
    try {
      const res = await fetch(`/api/academic-years/${selectedYear.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.success('Academic year deleted successfully')
        setShowDeleteDialog(false)
        fetchAcademicYears()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to delete academic year')
      }
    } catch {
      toast.error('Failed to delete academic year')
    } finally {
      setSaving(false)
    }
  }

  const handleSetActive = async (year: AcademicYear) => {
    if (year.isActive) return

    setSaving(true)
    try {
      const res = await fetch(`/api/academic-years/${year.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      })

      if (res.ok) {
        toast.success(`${year.name} is now the active academic year`)
        fetchAcademicYears()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to set active year')
      }
    } catch {
      toast.error('Failed to set active year')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (status === 'loading' || loading) {
    return <PageLoading />
  }

  return (
    <div className="content-reveal flex min-w-0 flex-col">
      <div className="w-full space-y-5">
        <PageHeader title="Settings" meta={['Program configuration']} />

        <Panel
          title="Academic years"
          description="Lessons, exams and attendance are organized by year; dashboards show the active one."
          actions={
            <Button size="sm" onClick={openCreateDialog}>
              <Plus />
              Add year
            </Button>
          }
        >
          {academicYears.length === 0 ? (
            <EmptyState title="No academic years yet" message="Add the first year to start scheduling lessons and exams." />
          ) : (
            <ul className="divide-y divide-line">
              {academicYears.map((year) => (
                <li key={year.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="flex min-w-40 flex-1 flex-col">
                    <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      {year.name.replace('-', '–')}
                      {year.isActive && <StatusBadge tone="ok">Active</StatusBadge>}
                    </span>
                    <span className="text-xs text-ink-3">
                      {formatDate(year.startDate)} – {formatDate(year.endDate)}
                    </span>
                  </div>
                  {year._count && (
                    <span className="tabular text-[13px] text-ink-2">
                      {year._count.lessons} lessons · {year._count.exams} exams
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {!year.isActive && (
                      <Button variant="outline" size="sm" onClick={() => handleSetActive(year)} disabled={saving}>
                        Set active
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${year.name}`} onClick={() => openEditDialog(year)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${year.name}`} className="hover:text-bad" onClick={() => openDeleteDialog(year)}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Create Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create academic year</DialogTitle>
              <DialogDescription>
                Add a new academic year for organizing lessons and exams
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., 2025-2026"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="size-4 accent-brand"
                />
                <Label htmlFor="isActive" className="text-sm font-normal">
                  Set as active year (dashboards will show this year by default)
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit academic year</DialogTitle>
              <DialogDescription>
                Update the academic year details
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., 2025-2026"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-startDate">Start Date</Label>
                  <Input
                    id="edit-startDate"
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-endDate">End Date</Label>
                  <Input
                    id="edit-endDate"
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-isActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="size-4 accent-brand"
                />
                <Label htmlFor="edit-isActive" className="text-sm font-normal">
                  Set as active year
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Academic Year</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{selectedYear?.name}</strong>?
                {selectedYear?._count && (selectedYear._count.lessons > 0 || selectedYear._count.exams > 0) && (
                  <span className="mt-2 block text-bad">
                    Warning: This year has {selectedYear._count.lessons} lessons and {selectedYear._count.exams} exams associated with it. Deleting may cause data loss.
                  </span>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-bad text-white hover:bg-bad/90"
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
