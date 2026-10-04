'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PageLoading } from '@/components/ui/page-loading'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { Initials } from '@/components/ds/person'
import { ChildPhotoField } from '@/components/sunday-school-child-photo'
import { FilterSelect } from '@/components/ui/filter-select'
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
import { getChildFullName, getChildPhotoUrl, getLevelDisplayName, LEVEL_ORDER } from '@/lib/sunday-school-class'
import type {
  SundaySchoolChild,
  SundaySchoolClass,
  SundaySchoolFamily,
} from '@/types/sunday-school'
import { SundaySchoolChildGender, SundaySchoolLevel } from '@prisma/client'
import { Check, House, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { SundaySchoolRosterImport } from '@/components/sunday-school-roster-import'
import { SundaySchoolRosterLinkDialog } from '@/components/sunday-school-roster-link-dialog'

const NEW_FAMILY_ID = '__new__'

interface ChildForm {
  firstName: string
  lastName: string
  gender: SundaySchoolChildGender | ''
  level: SundaySchoolLevel
  classId: string
  birthDate: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
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
  birthDate: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
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
  const { data, error: rosterError, isLoading, mutate } = useSundaySchoolChildren(selectedClassId || undefined)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPhoto, setEditingPhoto] = useState<{ photoUrl: string | null; accountPhotoUrl: string | null }>({ photoUrl: null, accountPhotoUrl: null })
  const [form, setForm] = useState<ChildForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [viewingFamily, setViewingFamily] = useState<SundaySchoolFamily | null>(null)
  const [rosterSearch, setRosterSearch] = useState('')

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
    setEditingPhoto({ photoUrl: child.photoUrl ?? null, accountPhotoUrl: child.user?.profileImageUrl ?? null })
    setForm({
      firstName: child.firstName,
      lastName: child.lastName,
      gender: child.gender ?? '',
      level: child.level,
      classId: child.classId ?? '',
      birthDate: child.birthDate ? child.birthDate.slice(0, 10) : '',
      guardianName: child.guardianName ?? '',
      guardianPhone: child.guardianPhone ?? '',
      guardianEmail: child.guardianEmail ?? '',
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
    if (!confirm(`Remove ${getChildFullName(child)} from the roster? Their attendance history is kept and they can be restored by an admin.`)) {
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
  // A class only accepts children at its own grade, so offering every class
  // would just produce a server-side rejection.
  const classesForLevel = classes.filter(cls => cls.level === form.level)

  const visibleChildren = children.filter(
    (child) => !rosterSearch || getChildFullName(child).toLowerCase().includes(rosterSearch.toLowerCase())
  )

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Roster"
          meta={['Children, family connections and contact details for your class']}
          actions={
            canManage && classes.length > 0 ? (
              <Button onClick={openCreate}>
                <Plus />
                Add child
              </Button>
            ) : undefined
          }
        />

        {classes.length === 0 ? (
          <Panel>
            <EmptyState message="You are not assigned to a Sunday School class yet. Ask your coordinator to add you." />
          </Panel>
        ) : (
          <Panel
            toolbar={
              <>
                <label className="flex items-center gap-2 text-xs font-medium text-ink-3">
                  Class
                  <FilterSelect
                    aria-label="Class"
                    value={selectedClassId}
                    onChange={setSelectedClassId}
                    options={classes.map((cls) => ({ value: cls.id, label: `${cls.name} — ${getLevelDisplayName(cls.level)}` }))}
                  />
                </label>
                <SearchField value={rosterSearch} onChange={setRosterSearch} placeholder="Search by name" />
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
                    <SundaySchoolRosterImport
                      classId={selectedClassId}
                      className={selectedClass?.name ?? 'this class'}
                      onSuccess={async () => {
                        await Promise.all([mutate(), mutateFamilies()])
                      }}
                    />
                    <SundaySchoolRosterLinkDialog
                      classId={selectedClassId}
                      className={selectedClass?.name ?? 'this class'}
                      onSuccess={async () => {
                        await Promise.all([mutate(), mutateFamilies()])
                      }}
                    />
                  </div>
                )}
              </>
            }
            footer={<span className="tabular">{visibleChildren.length} children</span>}
          >
            {isLoading ? (
              <EmptyState message="Loading roster…" />
            ) : rosterError ? (
              // Never show "no children" when the roster failed to load: it invites re-adding them.
              <EmptyState
                title="Couldn’t load this roster"
                message="Something went wrong on our side. Try again in a moment; if it keeps happening, tell a super admin."
                action={<Button variant="outline" onClick={() => mutate()}>Try again</Button>}
              />
            ) : visibleChildren.length === 0 ? (
              <EmptyState message={children.length === 0 ? (canManage ? 'No children yet. Add one, import a roster, or share the sign-up link.' : 'No children on this roster yet.') : 'No children match.'} />
            ) : (
              <ul className="divide-y divide-line">
                {visibleChildren.map((child) => (
                  <li
                    key={child.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3 lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)_minmax(0,14rem)_auto] lg:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Initials name={getChildFullName(child)} imageUrl={getChildPhotoUrl(child)} />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className={`truncate text-[13.5px] font-medium ${child.isActive ? 'text-ink' : 'text-ink-3 line-through'}`}>
                          {getChildFullName(child)}
                        </span>
                        <span className="text-xs text-ink-3">
                          {getLevelDisplayName(child.level)}
                          {child.gender && ` · ${child.gender === 'MALE' ? 'Boy' : 'Girl'}`}
                        </span>
                      </div>
                    </div>

                    <div className="order-3 col-span-2 min-w-0 text-[13px] text-ink-2 lg:order-none lg:col-span-1">
                      {child.family ? (
                        <div className="flex flex-col gap-0.5">
                          {(child.family.motherName || child.family.motherPhone) && (
                            <span className="flex flex-wrap items-center gap-x-1">
                              Mother: {child.family.motherName ?? '—'}
                              {child.family.motherPhone && (
                                <>
                                  <span aria-hidden>·</span>
                                  <CopyableValue value={child.family.motherPhone} label="mother's phone number" className="py-0.5" />
                                </>
                              )}
                            </span>
                          )}
                          {(child.family.fatherName || child.family.fatherPhone) && (
                            <span className="flex flex-wrap items-center gap-x-1">
                              Father: {child.family.fatherName ?? '—'}
                              {child.family.fatherPhone && (
                                <>
                                  <span aria-hidden>·</span>
                                  <CopyableValue value={child.family.fatherPhone} label="father's phone number" className="py-0.5" />
                                </>
                              )}
                            </span>
                          )}
                          <button
                            type="button"
                            className="inline-flex w-fit cursor-pointer items-center gap-1 text-accent-ink hover:underline"
                            onClick={() => setViewingFamily(child.family ?? null)}
                          >
                            <House className="size-3.5" aria-hidden />
                            {getFamilyDisplayName(child.family)}
                            {child.family.children.length > 1 &&
                              ` · ${child.family.children.length - 1} ${child.family.children.length === 2 ? 'sibling' : 'siblings'}`}
                          </button>
                        </div>
                      ) : child.guardianName || child.guardianPhone ? (
                        <span className="flex flex-wrap items-center gap-x-1">
                          Guardian: {child.guardianName ?? '—'}
                          {child.guardianPhone && (
                            <>
                              <span aria-hidden>·</span>
                              <CopyableValue value={child.guardianPhone} label="guardian's phone number" className="py-0.5" />
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-ink-3">No family on file</span>
                      )}
                      {child.notes && (
                        <p className="mt-0.5 truncate text-xs text-ink-3" title={child.notes}>
                          Note: {child.notes}
                        </p>
                      )}
                    </div>

                    <div className="order-4 col-span-2 min-w-0 lg:order-none lg:col-span-1">
                      {child.user ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge tone="ok">Linked</StatusBadge>
                          <CopyableValue value={child.user.email} label="student email" className="py-0.5 text-xs" />
                        </span>
                      ) : (
                        <StatusBadge tone="neutral">No account</StatusBadge>
                      )}
                    </div>

                    {canManage ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${getChildFullName(child)}`} onClick={() => openEdit(child)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove ${getChildFullName(child)}`} className="hover:text-bad" onClick={() => handleDelete(child)}>
                          <Trash2 />
                        </Button>
                      </div>
                    ) : (
                      <span />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
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
            {editingId ? (
              <ChildPhotoField
                childId={editingId}
                name={`${form.firstName} ${form.lastName}`.trim()}
                photoUrl={editingPhoto.photoUrl}
                accountPhotoUrl={editingPhoto.accountPhotoUrl}
                onChange={(photoUrl) => {
                  setEditingPhoto((prev) => ({ ...prev, photoUrl }))
                  mutate()
                }}
              />
            ) : (
              <p className="text-xs text-ink-3">You can add a photo after saving the child.</p>
            )}
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
                  onChange={e => {
                    const level = e.target.value as SundaySchoolLevel
                    setForm(prev => ({
                      ...prev,
                      level,
                      classId: classes.find(cls => cls.id === prev.classId)?.level === level
                        ? prev.classId
                        : classes.find(cls => cls.level === level)?.id ?? '',
                    }))
                  }}
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
                  <option value="">No class yet</option>
                  {classesForLevel.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>
                {classesForLevel.length === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    You do not serve a class at this grade.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="birthDate">Date of birth</Label>
              <Input
                id="birthDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.birthDate}
                onChange={e => setForm(prev => ({ ...prev, birthDate: e.target.value }))}
              />
              <p className="text-xs text-gray-500">
                Also used to tell two children with the same name apart on a roster import.
              </p>
            </div>

            <div className="space-y-3 rounded-lg border p-4 dark:border-gray-700">
              <p className="font-medium">Guardian contact</p>
              <p className="text-xs text-gray-500">
                Used when a child has no family record — this is what a roster CSV and a
                sign-up QR collect.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  aria-label="Guardian name"
                  placeholder="Name"
                  maxLength={200}
                  value={form.guardianName}
                  onChange={e => setForm(prev => ({ ...prev, guardianName: e.target.value }))}
                />
                <Input
                  aria-label="Guardian phone"
                  placeholder="Phone"
                  maxLength={50}
                  value={form.guardianPhone}
                  onChange={e => setForm(prev => ({ ...prev, guardianPhone: e.target.value }))}
                />
                <Input
                  aria-label="Guardian email"
                  type="email"
                  placeholder="Email"
                  value={form.guardianEmail}
                  onChange={e => setForm(prev => ({ ...prev, guardianEmail: e.target.value }))}
                />
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
