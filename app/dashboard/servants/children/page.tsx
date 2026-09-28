'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/admin/page-header'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useSundaySchoolGuard } from '@/hooks/useSundaySchoolGuard'
import {
  useSundaySchoolChildren,
  useSundaySchoolClasses,
  useSundaySchoolFamilies,
} from '@/lib/swr'
import { getChildFullName, getLevelDisplayName, LEVEL_ORDER } from '@/lib/sunday-school-class'
import type {
  SundaySchoolChild,
  SundaySchoolClass,
  SundaySchoolFamily,
} from '@/types/sunday-school'
import { SundaySchoolChildGender, SundaySchoolLevel } from '@prisma/client'
import { Check, House, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { SundaySchoolRosterImport } from '@/components/sunday-school-roster-import'

const NEW_FAMILY_ID = '__new__'

interface ChildForm {
  firstName: string
  lastName: string
  gender: SundaySchoolChildGender | ''
  level: SundaySchoolLevel
  classId: string
  familyId: string
  familyName: string
  homeAddress: string
  motherName: string
  motherPhone: string
  motherEmail: string
  fatherName: string
  fatherPhone: string
  fatherEmail: string
  linkedUserEmail: string
  notes: string
}

const EMPTY_FORM: ChildForm = {
  firstName: '',
  lastName: '',
  gender: '',
  level: 'GRADE_1',
  classId: '',
  familyId: NEW_FAMILY_ID,
  familyName: '',
  homeAddress: '',
  motherName: '',
  motherPhone: '',
  motherEmail: '',
  fatherName: '',
  fatherPhone: '',
  fatherEmail: '',
  linkedUserEmail: '',
  notes: '',
}

function getFamilyDisplayName(family: SundaySchoolFamily) {
  if (family.name) return family.name
  const lastName = family.children[0]?.lastName
  return lastName ? `${lastName} Family` : 'Family'
}

function familyFormFields(family?: SundaySchoolFamily | null) {
  return {
    familyName: family?.name ?? '',
    homeAddress: family?.homeAddress ?? '',
    motherName: family?.motherName ?? '',
    motherPhone: family?.motherPhone ?? '',
    motherEmail: family?.motherEmail ?? '',
    fatherName: family?.fatherName ?? '',
    fatherPhone: family?.fatherPhone ?? '',
    fatherEmail: family?.fatherEmail ?? '',
  }
}

function CopyableValue({
  value,
  label,
  className = '',
}: {
  value: string
  label: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
      className={`group -mx-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
        copied
          ? 'bg-green-50 text-green-700 dark:bg-green-950/50 dark:text-green-300'
          : 'hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100'
      } ${className}`}
    >
      <span className="min-w-0 break-words">{value}</span>
      {copied && (
        <span
          aria-live="polite"
          className="inline-flex shrink-0 items-center gap-1 text-xs text-green-600 dark:text-green-400"
        >
          <Check className="h-3.5 w-3.5 animate-in zoom-in-50 duration-200" />
          <span className="animate-in fade-in slide-in-from-left-1 duration-200">Copied</span>
        </span>
      )}
    </button>
  )
}

function SundaySchoolChildrenContent() {
  const { status } = useSundaySchoolGuard()
  const searchParams = useSearchParams()

  const { data: classesData } = useSundaySchoolClasses()
  const classes = useMemo(() => (classesData as SundaySchoolClass[] | undefined) ?? [], [classesData])
  const { data: familiesData, mutate: mutateFamilies } = useSundaySchoolFamilies()
  const families = useMemo(
    () => (familiesData as SundaySchoolFamily[] | undefined) ?? [],
    [familiesData]
  )

  const [selectedClassId, setSelectedClassId] = useState('')
  const { data, isLoading, mutate } = useSundaySchoolChildren(selectedClassId || undefined)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ChildForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [viewingFamily, setViewingFamily] = useState<SundaySchoolFamily | null>(null)

  // Editing a roster follows from serving that class, which the server decides
  const selectedClass = classes.find(c => c.id === selectedClassId)
  const canManage = selectedClass?.canServe ?? false
  const canLinkAccount = selectedClass?.canCoordinate ?? false

  useEffect(() => {
    if (selectedClassId || classes.length === 0) return
    const fromQuery = searchParams.get('classId')
    const match = fromQuery && classes.some(c => c.id === fromQuery) ? fromQuery : classes[0].id
    setSelectedClassId(match)
  }, [classes, searchParams, selectedClassId])

  const openCreate = () => {
    setEditingId(null)
    const cls = classes.find(c => c.id === selectedClassId)
    setForm({
      ...EMPTY_FORM,
      classId: selectedClassId,
      level: cls?.level ?? 'GRADE_1',
      familyName: '',
    })
    setDialogOpen(true)
  }

  const openEdit = (child: SundaySchoolChild) => {
    setEditingId(child.id)
    setForm({
      firstName: child.firstName,
      lastName: child.lastName,
      gender: child.gender ?? '',
      level: child.level,
      classId: child.classId ?? '',
      familyId: child.familyId ?? NEW_FAMILY_ID,
      ...familyFormFields(child.family),
      linkedUserEmail: child.user?.email ?? '',
      notes: child.notes ?? '',
    })
    setDialogOpen(true)
  }

  const handleFamilySelection = (familyId: string) => {
    if (familyId === NEW_FAMILY_ID || !familyId) {
      setForm(prev => ({
        ...prev,
        familyId,
        ...familyFormFields(),
      }))
      return
    }

    const family = families.find(item => item.id === familyId)
    setForm(prev => ({
      ...prev,
      familyId,
      ...familyFormFields(family),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const {
        familyId,
        familyName,
        homeAddress,
        motherName,
        motherPhone,
        motherEmail,
        fatherName,
        fatherPhone,
        fatherEmail,
        ...childFields
      } = form
      const url = editingId
        ? `/api/sunday-school/children/${editingId}`
        : '/api/sunday-school/children'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...childFields,
          classId: form.classId || null,
          familyId: familyId && familyId !== NEW_FAMILY_ID ? familyId : null,
          family: familyId
            ? {
                name: familyName,
                homeAddress,
                motherName,
                motherPhone,
                motherEmail,
                fatherName,
                fatherPhone,
                fatherEmail,
              }
            : null,
          ...(!editingId || !canLinkAccount ? { linkedUserEmail: undefined } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body.error || 'Failed to save the child')
      }

      toast.success(editingId ? 'Child updated' : 'Child added', {
        description: new Date().toLocaleString(),
      })
      setDialogOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      mutate()
      mutateFamilies()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to save the child')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (child: SundaySchoolChild) => {
    if (!confirm(`Remove ${getChildFullName(child)} from the roster? This also deletes their attendance history.`)) {
      return
    }

    try {
      const res = await fetch(`/api/sunday-school/children/${child.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'Failed to remove the child')
      }
      toast.success('Child removed')
      mutate()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove the child')
    }
  }

  if (status === 'loading') {
    return <PageLoading />
  }

  const children = (data as SundaySchoolChild[] | undefined) ?? []
  const selectedFormFamily = families.find(family => family.id === form.familyId)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Roster"
          description="Roster, family connections, and contact details for the children in your class."
          actions={
            canManage && classes.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <SundaySchoolRosterImport
                  classId={selectedClassId}
                  className={selectedClass?.name ?? 'this class'}
                  onSuccess={async () => {
                    await Promise.all([mutate(), mutateFamilies()])
                  }}
                />
                <Button onClick={openCreate}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add child
                </Button>
              </div>
            ) : undefined
          }
        />

        {classes.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <EmptyState message="You are not assigned to any Sunday School class yet." />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 max-w-sm">
                  <Label htmlFor="class-filter">Class</Label>
                  <select
                    id="class-filter"
                    value={selectedClassId}
                    onChange={e => setSelectedClassId(e.target.value)}
                    className="w-full h-9 rounded-md border px-3 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                  >
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} — {getLevelDisplayName(cls.level)}
                      </option>
                    ))}
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                {isLoading ? (
                  <p className="text-center py-8 text-gray-500">Loading roster…</p>
                ) : children.length === 0 ? (
                  <EmptyState message="No children on this roster yet." />
                ) : (
                  <div className="divide-y dark:divide-gray-800">
                    {children.map(child => (
                      <div
                        key={child.id}
                        className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)_auto] sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-medium ${child.isActive ? '' : 'text-gray-400 line-through'}`}>
                              {getChildFullName(child)}
                            </p>
                            <Badge variant="secondary">{getLevelDisplayName(child.level)}</Badge>
                            {child.gender && (
                              <Badge variant="outline">{child.gender === 'MALE' ? 'Boy' : 'Girl'}</Badge>
                            )}
                          </div>
                          {child.family ? (
                            <div className="mt-1 space-y-0.5 text-sm text-gray-600 dark:text-gray-400">
                              {(child.family.motherName || child.family.motherPhone) && (
                                <div className="flex flex-wrap items-center gap-x-1">
                                  <span>Mother: {child.family.motherName ?? '—'}</span>
                                  {child.family.motherPhone && (
                                    <>
                                      <span>·</span>
                                      <CopyableValue
                                        value={child.family.motherPhone}
                                        label="mother's phone number"
                                        className="py-0.5"
                                      />
                                    </>
                                  )}
                                </div>
                              )}
                              {(child.family.fatherName || child.family.fatherPhone) && (
                                <div className="flex flex-wrap items-center gap-x-1">
                                  <span>Father: {child.family.fatherName ?? '—'}</span>
                                  {child.family.fatherPhone && (
                                    <>
                                      <span>·</span>
                                      <CopyableValue
                                        value={child.family.fatherPhone}
                                        label="father's phone number"
                                        className="py-0.5"
                                      />
                                    </>
                                  )}
                                </div>
                              )}
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                onClick={() => setViewingFamily(child.family ?? null)}
                              >
                                <Users className="h-3.5 w-3.5" />
                                View {getFamilyDisplayName(child.family)}
                                {child.family.children.length > 1 && (
                                  <span>
                                    · {child.family.children.length - 1}{' '}
                                    {child.family.children.length === 2 ? 'sibling' : 'siblings'}
                                  </span>
                                )}
                              </button>
                            </div>
                          ) : (child.guardianName || child.guardianPhone) ? (
                            <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-gray-600 dark:text-gray-400">
                              <span>Guardian: {child.guardianName ?? '—'}</span>
                              {child.guardianPhone && (
                                <>
                                  <span>·</span>
                                  <CopyableValue
                                    value={child.guardianPhone}
                                    label="guardian's phone number"
                                    className="py-0.5"
                                  />
                                </>
                              )}
                            </div>
                          ) : null}
                          {child.user && (
                            <div className="mt-1 flex flex-wrap items-center gap-x-1 text-sm text-green-700 dark:text-green-400">
                              <span>Student account:</span>
                              <CopyableValue value={child.user.email} label="student email" className="py-0.5" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 sm:px-4">
                          {child.notes ? (
                            <p
                              className="truncate text-sm text-gray-600 dark:text-gray-300"
                              title={child.notes}
                            >
                              <span className="font-medium text-gray-500 dark:text-gray-400">Note:</span>{' '}
                              {child.notes}
                            </p>
                          ) : canManage ? (
                            <button
                              type="button"
                              className="text-sm text-gray-400 transition-colors hover:text-primary"
                              onClick={() => openEdit(child)}
                            >
                              Add note
                            </button>
                          ) : (
                            <p className="text-sm text-gray-400">No note</p>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(child)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDelete(child)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit child' : 'Add a child'}</DialogTitle>
            <DialogDescription>
              Family contact is only visible to the servants of this class and to leaders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={e => setForm(prev => ({ ...prev, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={e => setForm(prev => ({ ...prev, lastName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="child-gender">Gender</Label>
                <select
                  id="child-gender"
                  value={form.gender}
                  onChange={e => setForm(prev => ({
                    ...prev,
                    gender: e.target.value as SundaySchoolChildGender | '',
                  }))}
                  className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">Not specified</option>
                  <option value="MALE">Boy</option>
                  <option value="FEMALE">Girl</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="child-level">Grade</Label>
                <select
                  id="child-level"
                  value={form.level}
                  onChange={e => setForm(prev => ({ ...prev, level: e.target.value as SundaySchoolLevel }))}
                  className="w-full h-9 rounded-md border px-3 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                >
                  {LEVEL_ORDER.map(level => (
                    <option key={level} value={level}>
                      {getLevelDisplayName(level)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="child-class">Class</Label>
                <select
                  id="child-class"
                  value={form.classId}
                  onChange={e => setForm(prev => ({ ...prev, classId: e.target.value }))}
                  className="w-full h-9 rounded-md border px-3 text-sm bg-white dark:bg-gray-900 dark:border-gray-700"
                >
                  {classes.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {editingId && canLinkAccount && (
              <div className="space-y-2 rounded-lg border p-3 dark:border-gray-700">
                <Label htmlFor="linkedUserEmail">Child account email</Label>
                <Input
                  id="linkedUserEmail"
                  type="email"
                  placeholder="student@example.com"
                  value={form.linkedUserEmail}
                  onChange={e => setForm(prev => ({ ...prev, linkedUserEmail: e.target.value }))}
                />
                <p className="text-xs text-gray-500">
                  Link an existing active student account so this child can see class lessons.
                  Leave blank to remove the current link.
                </p>
              </div>
            )}

            <div className="space-y-4 rounded-lg border p-4 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <House className="h-4 w-4 text-gray-500" />
                <p className="font-medium">Family and household</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="child-family">Family connection</Label>
                <select
                  id="child-family"
                  value={form.familyId}
                  onChange={e => handleFamilySelection(e.target.value)}
                  className="h-9 w-full rounded-md border bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
                >
                  <option value="">No family record</option>
                  <option value={NEW_FAMILY_ID}>Create a new family</option>
                  {families.map(family => (
                    <option key={family.id} value={family.id}>
                      {getFamilyDisplayName(family)} —{' '}
                      {family.children.map(child => `${child.firstName} ${child.lastName}`).join(', ')}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500">
                  Choose an existing family to connect siblings. Shared details update for every linked child.
                </p>
              </div>

              {form.familyId && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="familyName">Family name</Label>
                      <Input
                        id="familyName"
                        placeholder={form.lastName ? `${form.lastName} Family` : 'Family name'}
                        value={form.familyName}
                        onChange={e => setForm(prev => ({ ...prev, familyName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="homeAddress">Home address</Label>
                      <Input
                        id="homeAddress"
                        placeholder="Street, city, state, ZIP"
                        value={form.homeAddress}
                        onChange={e => setForm(prev => ({ ...prev, homeAddress: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900">
                      <p className="text-sm font-medium">Mother</p>
                      <Input
                        aria-label="Mother name"
                        placeholder="Name"
                        value={form.motherName}
                        onChange={e => setForm(prev => ({ ...prev, motherName: e.target.value }))}
                      />
                      <Input
                        aria-label="Mother phone"
                        placeholder="Phone"
                        value={form.motherPhone}
                        onChange={e => setForm(prev => ({ ...prev, motherPhone: e.target.value }))}
                      />
                      <Input
                        aria-label="Mother email"
                        type="email"
                        placeholder="Email"
                        value={form.motherEmail}
                        onChange={e => setForm(prev => ({ ...prev, motherEmail: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-3 rounded-md bg-gray-50 p-3 dark:bg-gray-900">
                      <p className="text-sm font-medium">Father</p>
                      <Input
                        aria-label="Father name"
                        placeholder="Name"
                        value={form.fatherName}
                        onChange={e => setForm(prev => ({ ...prev, fatherName: e.target.value }))}
                      />
                      <Input
                        aria-label="Father phone"
                        placeholder="Phone"
                        value={form.fatherPhone}
                        onChange={e => setForm(prev => ({ ...prev, fatherPhone: e.target.value }))}
                      />
                      <Input
                        aria-label="Father email"
                        type="email"
                        placeholder="Email"
                        value={form.fatherEmail}
                        onChange={e => setForm(prev => ({ ...prev, fatherEmail: e.target.value }))}
                      />
                    </div>
                  </div>

                  {selectedFormFamily && selectedFormFamily.children.length > 0 && (
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <span className="font-medium">Children in this family:</span>{' '}
                      {selectedFormFamily.children
                        .map(child => `${child.firstName} ${child.lastName}`)
                        .join(', ')}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={3}
                value={form.notes}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.firstName.trim() || !form.lastName.trim()}
            >
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add child'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(viewingFamily)}
        onOpenChange={open => {
          if (!open) setViewingFamily(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          {viewingFamily && (
            <>
              <DialogHeader>
                <DialogTitle>{getFamilyDisplayName(viewingFamily)}</DialogTitle>
                <DialogDescription>
                  Shared household details and children connected to this family.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="rounded-lg border p-4 dark:border-gray-700">
                  <div className="flex items-start gap-2">
                    <House className="mt-0.5 h-4 w-4 text-gray-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">Home address</p>
                      {viewingFamily.homeAddress ? (
                        <CopyableValue
                          value={viewingFamily.homeAddress}
                          label="home address"
                          className="mt-1 text-sm text-gray-600 sm:whitespace-nowrap dark:text-gray-400"
                        />
                      ) : (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          No address added yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4 dark:border-gray-700">
                    <p className="font-medium">Mother</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <p>{viewingFamily.motherName || 'Not added'}</p>
                      {viewingFamily.motherPhone && (
                        <div>
                          <CopyableValue
                            value={viewingFamily.motherPhone}
                            label="mother's phone number"
                          />
                        </div>
                      )}
                      {viewingFamily.motherEmail && (
                        <div>
                          <CopyableValue value={viewingFamily.motherEmail} label="mother's email" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4 dark:border-gray-700">
                    <p className="font-medium">Father</p>
                    <div className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      <p>{viewingFamily.fatherName || 'Not added'}</p>
                      {viewingFamily.fatherPhone && (
                        <div>
                          <CopyableValue
                            value={viewingFamily.fatherPhone}
                            label="father's phone number"
                          />
                        </div>
                      )}
                      {viewingFamily.fatherEmail && (
                        <div>
                          <CopyableValue value={viewingFamily.fatherEmail} label="father's email" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-500" />
                    <p className="font-medium">Children</p>
                  </div>
                  <div className="divide-y rounded-lg border px-4 dark:divide-gray-700 dark:border-gray-700">
                    {viewingFamily.children.map(child => (
                      <div
                        key={child.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3"
                      >
                        <p className="font-medium">
                          {child.firstName} {child.lastName}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{getLevelDisplayName(child.level)}</Badge>
                          {child.class && (
                            <span className="text-sm text-gray-500">{child.class.name}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function SundaySchoolChildrenPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <SundaySchoolChildrenContent />
    </Suspense>
  )
}
