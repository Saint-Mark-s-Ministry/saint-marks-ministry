'use client'
import { useSession } from 'next-auth/react'
import { ContactBookAccessSwitch } from '@/components/contact-book-access-switch'
import { UserOrganizationDialog } from '@/components/user-organization-dialog'
import { SundaySchoolUserClassDialog } from '@/components/sunday-school-user-class-dialog'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  canBeAssignedToSundaySchool,
  canBeMentor,
  canManageAllUsers,
  getRoleDisplayName,
} from '@/lib/roles'
import { RoleTag, UserRole } from '@prisma/client'
import { toast } from 'sonner'
import { Camera, Trash2, Pencil, Plus, School, X } from 'lucide-react'
import { PageHeader } from '@/components/ds/page-header'
import { Panel } from '@/components/ds/panel'
import { SearchField } from '@/components/ds/search-field'
import { StatusBadge } from '@/components/ds/status-badge'
import { BulkBar } from '@/components/ds/bulk-bar'
import { Initials } from '@/components/ds/person'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterSelect } from '@/components/ui/filter-select'
import { ImageCropDialog } from '@/components/image-crop-dialog'
import { PageLoading } from '@/components/ui/page-loading'
import { UserRoleTagEditor } from '@/components/user-role-tag-editor'
import { UserRoleTagBadges } from '@/components/user-role-tag-badges'
import { getLevelDisplayName } from '@/lib/sunday-school-class'
import {
  getSundaySchoolAssignmentLevels,
  type SundaySchoolAssignmentSummary,
} from '@/lib/sunday-school-user-assignments'

interface User {
  id: string
  name: string
  email: string
  phone?: string
  profileImageUrl?: string | null
  role: UserRole
  roleAssignments?: { tag: RoleTag }[]
  sundaySchoolServing?: SundaySchoolAssignmentSummary[]
  isDisabled?: boolean
  canAccessContactBook?: boolean
  _count?: {
    mentoredStudents: number
  }
}

export default function UsersPage() {
  const { update: refreshSession } = useSession()
  const sundaySchoolMode = usePathname().startsWith('/dashboard/servants/users')
  const [organizationUser, setOrganizationUser] = useState<User | null>(null)
  const [classAssignmentUser, setClassAssignmentUser] = useState<User | null>(null)
  const { session, status } = useAdminGuard(canManageAllUsers)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [isFiltering, setIsFiltering] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  // Bulk selection state (SUPER_ADMIN only)
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)

  // Confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<'enable' | 'disable' | null>(null)

  // Password reset dialog state
  const [passwordResetOpen, setPasswordResetOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'STUDENT' as UserRole,
    roleTags: [RoleTag.SERVANTS_PREP_STUDENT] as RoleTag[],
    roleAuditNote: '',
    canAccessContactBook: false,
  })
  const [formError, setFormError] = useState('')

  const fetchUsers = useCallback(async (search?: string, role?: string, isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true)
      } else {
        setIsFiltering(true)
      }
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (role) params.set('role', role)

      const url = `/api/users${params.toString() ? `?${params.toString()}` : ''}`
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to fetch users')
      const data = await res.json() as User[]
      setUsers(data)
      return data
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setLoading(false)
      setIsFiltering(false)
    }
  }, [])

  // Track if this is the initial load
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)

  useEffect(() => {
    if (session?.user?.role && canManageAllUsers(session.user.role)) {
      const isInitial = !hasInitiallyLoaded
      fetchUsers(debouncedSearch, roleFilter, isInitial)
      if (!hasInitiallyLoaded) {
        setHasInitiallyLoaded(true)
      }
    }
  }, [session, debouncedSearch, roleFilter, fetchUsers, hasInitiallyLoaded])

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    try {
      const createPayload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: formData.role,
      }
      if (isSuperAdmin) createPayload.roleTags = formData.roleTags

      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      await fetchUsers(debouncedSearch, roleFilter)
      setShowCreateForm(false)
      setFormData({ name: '', email: '', phone: '', password: '', role: 'STUDENT', roleTags: [RoleTag.SERVANTS_PREP_STUDENT], roleAuditNote: '', canAccessContactBook: false })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user')
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setFormError('')

    try {
      const updatePayload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
      }
      if (!isSuperAdmin) updatePayload.role = formData.role

      // Include password only if provided (SUPER_ADMIN only)
      if (formData.password) {
        updatePayload.password = formData.password
      }

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      const currentRoleTags = editingUser.roleAssignments?.map((assignment) => assignment.tag) ?? []
      const roleTagsChanged =
        currentRoleTags.length !== formData.roleTags.length ||
        currentRoleTags.some((tag) => !formData.roleTags.includes(tag))

      if (isSuperAdmin && roleTagsChanged) {
        const roleResponse = await fetch(`/api/admin/users/${editingUser.id}/roles`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roleTags: formData.roleTags,
            note: formData.roleAuditNote || undefined,
          }),
        })
        const roleData = await roleResponse.json()
        if (!roleResponse.ok) {
          throw new Error(`Profile fields were saved, but access tags were not updated: ${roleData.error || 'Unknown error'}`)
        }
      }

      if (isSuperAdmin && !formData.roleTags.includes(RoleTag.SUPER_ADMIN) && formData.canAccessContactBook !== (editingUser.canAccessContactBook ?? false)) {
        const accessResponse = await fetch(`/api/admin/users/${editingUser.id}/contact-book-access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ canAccessContactBook: formData.canAccessContactBook }),
        })
        if (!accessResponse.ok) {
          const accessData = await accessResponse.json()
          throw new Error(`Profile fields were saved, but contact book access was not updated: ${accessData.error || 'Unknown error'}`)
        }
        if (editingUser.id === session?.user.id) await refreshSession({ refreshContactBook: true })
      }

      await fetchUsers(debouncedSearch, roleFilter)

      // Show appropriate success message
      if (formData.password) {
        toast.success('User updated with new password', {
          description: 'User will be prompted to change password on next login'
        })
      } else {
        toast.success('User updated successfully')
      }

      setEditingUser(null)
      setFormData({ name: '', email: '', phone: '', password: '', role: 'STUDENT', roleTags: [RoleTag.SERVANTS_PREP_STUDENT], roleAuditNote: '', canAccessContactBook: false })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update user')
    }
  }

  const handleDeleteUser = (userId: string) => {
    setDeleteUserId(userId)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteUser = async () => {
    if (!deleteUserId) return

    try {
      const res = await fetch(`/api/users/${deleteUserId}`, {
        method: 'DELETE'
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete user')
      }

      await fetchUsers(debouncedSearch, roleFilter)
      toast.success('User deleted successfully!')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user')
    } finally {
      setDeleteConfirmOpen(false)
      setDeleteUserId(null)
    }
  }

  const editFormRef = useRef<HTMLDivElement>(null)

  const startEdit = (user: User) => {
    setEditingUser(user)
    setFormData({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role,
      roleTags: user.roleAssignments?.map((assignment) => assignment.tag) ?? [],
      roleAuditNote: '',
      canAccessContactBook: user.canAccessContactBook ?? false,
    })
    setShowCreateForm(false)
    setFormError('')
    // Scroll to the inline form after render
    setTimeout(() => {
      editFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 50)
  }

  const cancelForm = () => {
    setShowCreateForm(false)
    setEditingUser(null)
    setFormData({ name: '', email: '', phone: '', password: '', role: 'STUDENT', roleTags: [RoleTag.SERVANTS_PREP_STUDENT], roleAuditNote: '', canAccessContactBook: false })
    setFormError('')
  }

  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingUser) return
    e.target.value = ''

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Please upload PNG, JPG, or GIF')
      return
    }
    if (file.size > 4.5 * 1024 * 1024) {
      toast.error('File size exceeds 4.5 MB limit')
      return
    }

    setPendingPhotoFile(file)
    const reader = new FileReader()
    reader.onload = () => setCropImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropImageSrc(null)
    if (!editingUser) return
    setUploadingPhoto(true)
    try {
      const fileName = pendingPhotoFile?.name || 'profile.jpg'
      const croppedFile = new File([croppedBlob], fileName, { type: 'image/jpeg' })
      const fd = new FormData()
      fd.append('file', croppedFile)
      fd.append('userId', editingUser.id)

      const res = await fetch('/api/profile-picture/upload', {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        const data = await res.json()
        setEditingUser({ ...editingUser, profileImageUrl: data.url })
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, profileImageUrl: data.url } : u))
        toast.success('Profile picture updated!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to upload photo')
      }
    } catch (error) {
      console.error('Failed to upload photo:', error)
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      setPendingPhotoFile(null)
    }
  }

  const handleRemovePhoto = async () => {
    if (!editingUser) return
    setUploadingPhoto(true)
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileImageUrl: null }),
      })
      if (res.ok) {
        setEditingUser({ ...editingUser, profileImageUrl: null })
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, profileImageUrl: null } : u))
        toast.success('Profile picture removed!')
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to remove photo')
      }
    } catch (error) {
      console.error('Failed to remove photo:', error)
      toast.error('Failed to remove photo')
    } finally {
      setUploadingPhoto(false)
    }
  }

  // Bulk selection handlers (SUPER_ADMIN only)
  const toggleUserSelection = (userId: string) => {
    const newSelected = new Set(selectedUsers)
    if (newSelected.has(userId)) {
      newSelected.delete(userId)
    } else {
      newSelected.add(userId)
    }
    setSelectedUsers(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedUsers.size === selectableUsers.length) {
      setSelectedUsers(new Set())
    } else {
      setSelectedUsers(new Set(selectableUsers.map(u => u.id)))
    }
  }

  const handleBulkDisable = (disable: boolean) => {
    if (selectedUsers.size === 0) return
    setBulkAction(disable ? 'disable' : 'enable')
    setBulkConfirmOpen(true)
  }

  const confirmBulkAction = async () => {
    if (!bulkAction || selectedUsers.size === 0) return

    const disable = bulkAction === 'disable'
    const action = bulkAction

    setIsBulkProcessing(true)
    try {
      const res = await fetch('/api/users/bulk-disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          isDisabled: disable
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} users`)
      }

      toast.success(`Successfully ${action}d ${data.updatedCount} user(s)`)
      setSelectedUsers(new Set())
      await fetchUsers(debouncedSearch, roleFilter)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${action} users`)
    } finally {
      setIsBulkProcessing(false)
      setBulkConfirmOpen(false)
      setBulkAction(null)
    }
  }

  const handleBulkPasswordReset = () => {
    if (selectedUsers.size === 0) return
    setNewPassword('')
    setPasswordResetOpen(true)
  }

  const confirmPasswordReset = async () => {
    if (selectedUsers.size === 0 || !newPassword) return

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setIsBulkProcessing(true)
    try {
      const res = await fetch('/api/users/bulk-reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          newPassword
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset passwords')
      }

      toast.success(`Password reset for ${data.updatedCount} user(s)`, {
        description: 'Users will be prompted to change password on next login'
      })
      setSelectedUsers(new Set())
      setNewPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset passwords')
    } finally {
      setIsBulkProcessing(false)
      setPasswordResetOpen(false)
    }
  }

  // Users that can be selected for bulk operations (not SUPER_ADMIN, not current user)
  const selectableUsers = users.filter(u => u.role !== 'SUPER_ADMIN' && u.id !== session?.user?.id)
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN'

  if (
    loading ||
    status !== 'authenticated' ||
    !session?.user?.role ||
    !canManageAllUsers(session.user.role)
  ) {
    return <PageLoading />
  }

  const roleOptions: UserRole[] = ['SUPER_ADMIN', 'PRIEST', 'SERVANT_PREP', 'MENTOR', 'SERVANT', 'STUDENT']
  const filterRoleOptions = roleOptions

  const openCreate = () => {
    setShowCreateForm(true)
    setEditingUser(null)
    setFormData({ name: '', email: '', phone: '', password: '', role: 'STUDENT', roleTags: [RoleTag.SERVANTS_PREP_STUDENT], roleAuditNote: '', canAccessContactBook: false })
  }

  return (
    <div className="content-reveal flex min-w-0 flex-col">
      <div className="space-y-5">
        <PageHeader
          title="Users"
          meta={[`${users.length} accounts${roleFilter || searchQuery ? ' match' : ''}`, sundaySchoolMode ? 'Sunday School' : 'across both ministries']}
          actions={
            <Button onClick={openCreate} disabled={showCreateForm || editingUser !== null}>
              <Plus />
              Create user
            </Button>
          }
        />

        {/* Create Form (only for new user) */}
        {showCreateForm && (
          <Panel title="Create user">
            <div className="px-4 py-4">
              <form onSubmit={handleCreateUser} className="space-y-4">
                {formError && (
                  <div role="alert" className="rounded-md bg-bad-tint px-3 py-2 text-[13px] text-bad">
                    {formError}
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone (optional)</Label>
                    <Input id="phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(555) 123-4567" />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required />
                  </div>
                  {!isSuperAdmin && (
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <select id="role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                        {roleOptions.map(role => (<option key={role} value={role}>{getRoleDisplayName(role)}</option>))}
                      </select>
                    </div>
                  )}
                </div>
                {isSuperAdmin && (
                  <UserRoleTagEditor
                    value={formData.roleTags}
                    onChange={(roleTags) => setFormData({ ...formData, roleTags })}
                  />
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={cancelForm}>Cancel</Button>
                  <Button type="submit">Create user</Button>
                </div>
              </form>
            </div>
          </Panel>
        )}

        <Panel
          toolbar={
            <>
              <div className="relative w-full md:w-auto">
                <SearchField value={searchQuery} onChange={setSearchQuery} placeholder="Search name, email, phone" label="Search users" className="md:w-[260px]" />
                {isFiltering && (
                  <span className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
                )}
              </div>
              <FilterSelect
                aria-label="Filter by role"
                value={roleFilter}
                onChange={(v) => setRoleFilter(v as UserRole | '')}
                options={[{ value: '', label: 'All roles' }, ...filterRoleOptions.map((role) => ({ value: role, label: getRoleDisplayName(role) }))]}
              />
              {(searchQuery || roleFilter) && (
                <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(''); setRoleFilter('') }}>
                  <X />
                  Clear
                </Button>
              )}
              {isSuperAdmin && selectableUsers.length > 0 && (
                <Button variant="ghost" size="sm" className="md:ml-auto" onClick={toggleSelectAll} disabled={isBulkProcessing}>
                  {selectedUsers.size === selectableUsers.length ? 'Deselect all' : `Select all (${selectableUsers.length})`}
                </Button>
              )}
            </>
          }
          footer={<span className="tabular">{users.length} users</span>}
        >
          {isSuperAdmin && (
            <BulkBar count={selectedUsers.size} noun={selectedUsers.size === 1 ? 'user selected' : 'users selected'} onClear={() => setSelectedUsers(new Set())}>
              <Button size="sm" variant="outline" onClick={() => handleBulkDisable(false)} disabled={isBulkProcessing}>
                Enable
              </Button>
              <Button size="sm" variant="outline" onClick={handleBulkPasswordReset} disabled={isBulkProcessing}>
                Reset password
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleBulkDisable(true)} disabled={isBulkProcessing}>
                {isBulkProcessing ? 'Working…' : 'Disable'}
              </Button>
            </BulkBar>
          )}
          <div>
            {/* Desktop View */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-[13px] text-ink">
                <thead className="bg-raised text-xs text-ink-3 [&_th]:h-9 [&_th]:font-medium">
                  <tr>
                    {isSuperAdmin && (
                      <th className="text-center p-2 w-10">
                        <input
                          type="checkbox"
                          checked={selectableUsers.length > 0 && selectedUsers.size === selectableUsers.length}
                          onChange={toggleSelectAll}
                          className="size-[15px] accent-brand"
                          aria-label="Select all"
                        />
                      </th>
                    )}
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Email</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="p-2 text-left w-44">Access</th>
                    <th className="p-2 text-left w-44">SS grades</th>
                    <th className="text-center p-2 w-24">Status</th>
                    <th className="text-center p-2 w-24">Mentees</th>
                    <th className="text-center p-2 w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isCurrentUser = user.id === session?.user?.id
                    const canSelect = user.role !== 'SUPER_ADMIN' && !isCurrentUser
                    const isEditing = editingUser?.id === user.id
                    const sundaySchoolLevels = getSundaySchoolAssignmentLevels(user.sundaySchoolServing)

                    return (
                      <React.Fragment key={user.id}>
                        <tr className={`h-[52px] border-b border-line ${isEditing || selectedUsers.has(user.id) ? 'bg-accent-tint' : user.isDisabled ? 'text-ink-3' : 'hover:bg-hover/60'}`}>
                          {isSuperAdmin && (
                            <td className="p-2 text-center">
                              {canSelect ? (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${user.name}`}
                                  checked={selectedUsers.has(user.id)}
                                  onChange={() => toggleUserSelection(user.id)}
                                  className="size-[15px] accent-brand"
                                />
                              ) : (
                                <span className="text-gray-300">-</span>
                              )}
                            </td>
                          )}
                          <td className="p-2 font-medium whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Initials name={user.name} imageUrl={user.profileImageUrl} />
                              <span>
                                {isSuperAdmin && user.role !== 'STUDENT' ? (
                                                                  <button type="button" onClick={() => setOrganizationUser(user)} className="text-left hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" aria-label={`View ${user.name}'s organization`}>{user.name}<span className="ml-1 text-xs text-muted-foreground">↗</span></button>
                                                                ) : user.role === 'STUDENT' ? (
                                  <Link href={`/dashboard/admin/students?student=${user.id}`} className="hover:text-blue-600 hover:underline">
                                    {user.name}
                                  </Link>
                                ) : (
                                  user.name
                                )}
                                {isCurrentUser && (
                                  <Badge variant="outline" className="ml-2 text-xs">You</Badge>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="p-2 text-gray-600">{user.email}</td>
                          <td className="p-2 text-gray-600">{user.phone || '-'}</td>
                          <td className="p-2 text-center">
                            <UserRoleTagBadges
                              tags={user.roleAssignments?.map((assignment) => assignment.tag) ?? []}
                              legacyRole={user.role}
                            />
                          </td>
                          <td className="p-2 text-center">
                            {sundaySchoolLevels.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {sundaySchoolLevels.map(level => (
                                  <StatusBadge key={level} tone="gold" dot={false}>
                                    {getLevelDisplayName(level)}
                                  </StatusBadge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                            {sundaySchoolMode && canBeAssignedToSundaySchool(
                              user.role,
                              user.roleAssignments?.map(assignment => assignment.tag) ?? []
                            ) && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-7 px-2 text-xs"
                                onClick={() => setClassAssignmentUser(user)}
                              >
                                <School className="mr-1 h-3 w-3" />
                                Manage classes
                              </Button>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            {user.isDisabled ? <StatusBadge tone="neutral">Disabled</StatusBadge> : <StatusBadge tone="ok">Active</StatusBadge>}
                          </td>
                          <td className="p-2 text-center">
                            {canBeMentor(user.role) ? (
                              <span className="font-medium">{user._count?.mentoredStudents || 0}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="p-2">
                            <div className="flex justify-center gap-1">
                              {isEditing ? (
                                <Button size="sm" variant="ghost" onClick={cancelForm} className="h-7 px-2 text-xs gap-1">
                                  <X className="h-3 w-3" /> Close
                                </Button>
                              ) : (
                                <>
                                  <Button size="sm" variant="ghost" onClick={() => startEdit(user)} className="h-7 px-2 text-xs gap-1">
                                    <Pencil className="h-3 w-3" /> Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDeleteUser(user.id)} disabled={isCurrentUser} className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Inline Edit Form - Desktop */}
                        {isEditing && (
                          <tr>
                            <td colSpan={isSuperAdmin ? 10 : 9} className="p-0">
                              <div ref={editFormRef} className="bg-blue-50/50 dark:bg-blue-950/10 border-b-2 border-blue-200 dark:border-blue-800 px-4 py-4">
                                <form onSubmit={handleUpdateUser} className="space-y-3">
                                  {formError && (
                                    <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{formError}</div>
                                  )}
                                  <div className="flex gap-6">
                                    {/* Photo section */}
                                    <div className="flex flex-col items-center gap-2 shrink-0">
                                      <Avatar className="h-16 w-16">
                                        {editingUser.profileImageUrl && (
                                          <AvatarImage src={editingUser.profileImageUrl} alt={editingUser.name} />
                                        )}
                                        <AvatarFallback className="bg-maroon-600 text-white text-lg">
                                          {editingUser.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="flex gap-1">
                                        <Button type="button" variant="outline" size="sm" disabled={uploadingPhoto} onClick={() => document.getElementById(`edit-user-photo-${editingUser.id}`)?.click()} className="h-7 px-2 text-xs gap-1">
                                          <Camera className="h-3 w-3" />
                                          {uploadingPhoto ? '...' : 'Photo'}
                                        </Button>
                                        {editingUser.profileImageUrl && (
                                          <Button type="button" variant="outline" size="sm" disabled={uploadingPhoto} onClick={handleRemovePhoto} className="h-7 px-2 text-xs text-red-600 hover:text-red-700">
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                      <input id={`edit-user-photo-${editingUser.id}`} type="file" accept="image/png,image/jpeg,image/jpg,image/gif" className="hidden" onChange={handlePhotoSelect} disabled={uploadingPhoto} />
                                    </div>
                                    {/* Fields */}
                                    <div className="flex-1 grid grid-cols-2 xl:grid-cols-3 gap-3">
                                      <div>
                                        <Label htmlFor="edit-name" className="text-xs">Name</Label>
                                        <Input id="edit-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="h-9" />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-email" className="text-xs">Email</Label>
                                        <Input id="edit-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required className="h-9" />
                                      </div>
                                      <div>
                                        <Label htmlFor="edit-phone" className="text-xs">Phone</Label>
                                        <Input id="edit-phone" type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="(555) 123-4567" className="h-9" />
                                      </div>
                                      {!isSuperAdmin && (
                                        <div>
                                          <Label htmlFor="edit-role" className="text-xs">Role</Label>
                                          <select id="edit-role" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                                            {roleOptions.map(role => (<option key={role} value={role}>{getRoleDisplayName(role)}</option>))}
                                          </select>
                                        </div>
                                      )}
                                      {session?.user?.role === 'SUPER_ADMIN' && (
                                        <div>
                                          <Label htmlFor="edit-password" className="text-xs">New Password</Label>
                                          <Input id="edit-password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Leave blank to keep" className="h-9" />
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {isSuperAdmin && (
                                    <div className="space-y-2 rounded-md border bg-background p-3">
                                      <UserRoleTagEditor
                                        value={formData.roleTags}
                                        onChange={(roleTags) => setFormData({ ...formData, roleTags })}
                                        compact
                                      >
                                        {!formData.roleTags.includes(RoleTag.SUPER_ADMIN) && (
                                          <ContactBookAccessSwitch
                                            checked={formData.canAccessContactBook}
                                            onChange={(canAccessContactBook) => setFormData({ ...formData, canAccessContactBook })}
                                            disabled={!!session?.impersonating}
                                          />
                                        )}
                                      </UserRoleTagEditor>
                                      <div>
                                        <Label htmlFor="edit-role-note" className="text-xs">Audit note (optional)</Label>
                                        <Input
                                          id="edit-role-note"
                                          value={formData.roleAuditNote}
                                          onChange={(e) => setFormData({ ...formData, roleAuditNote: e.target.value })}
                                          placeholder="Why are these access tags changing?"
                                          maxLength={500}
                                          className="h-9"
                                        />
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex gap-2 justify-end">
                                    <Button type="button" variant="outline" size="sm" onClick={cancelForm}>Cancel</Button>
                                    <Button type="submit" size="sm">Save Changes</Button>
                                  </div>
                                </form>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>

              {users.length === 0 && (
                <EmptyState message={searchQuery || roleFilter ? 'No users match your search.' : 'No users yet.'} />
              )}
            </div>

            {/* Mobile View */}
            <div className="lg:hidden space-y-1">
              {users.map((user) => {
                const isCurrentUser = user.id === session?.user?.id
                const canSelect = user.role !== 'SUPER_ADMIN' && !isCurrentUser
                const isEditing = editingUser?.id === user.id
                const sundaySchoolLevels = getSundaySchoolAssignmentLevels(user.sundaySchoolServing)

                return (
                  <div key={user.id}>
                    <div className={`flex items-center gap-2 p-2 border rounded-md ${isEditing ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 rounded-b-none' : user.isDisabled ? 'bg-red-50' : 'bg-white dark:bg-gray-900'}`}>
                      {isSuperAdmin && (
                        <div className="shrink-0">
                          {canSelect ? (
                            <input type="checkbox" checked={selectedUsers.has(user.id)} onChange={() => toggleUserSelection(user.id)} className="h-4 w-4 rounded border-gray-300" />
                          ) : (
                            <div className="w-4" />
                          )}
                        </div>
                      )}
                      <Avatar className="h-7 w-7 shrink-0">
                        {user.profileImageUrl && (<AvatarImage src={user.profileImageUrl} alt={user.name} />)}
                        <AvatarFallback className="bg-maroon-600 text-white text-[10px]">
                          {user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isSuperAdmin && user.role !== 'STUDENT' ? (
                                                      <button type="button" onClick={() => setOrganizationUser(user)} className="text-left font-medium text-sm hover:text-indigo-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded" aria-label={`View ${user.name}'s organization`}>{user.name}<span className="ml-1 text-xs text-muted-foreground">↗</span></button>
                                                    ) : user.role === 'STUDENT' ? (
                            <Link href={`/dashboard/admin/students?student=${user.id}`} className="font-medium text-sm truncate hover:text-blue-600 hover:underline">{user.name}</Link>
                          ) : (
                            <span className="font-medium text-sm truncate">{user.name}</span>
                          )}
                          {isCurrentUser && <Badge variant="outline" className="text-[10px] px-1 py-0">You</Badge>}
                          {user.isDisabled && <Badge className="bg-red-500 text-[10px] px-1 py-0">Disabled</Badge>}
                          <UserRoleTagBadges
                            tags={user.roleAssignments?.map((assignment) => assignment.tag) ?? []}
                            legacyRole={user.role}
                          />
                          {canBeMentor(user.role) && user._count?.mentoredStudents ? (
                            <span className="text-[10px] text-gray-500">({user._count.mentoredStudents})</span>
                          ) : null}
                        </div>
                        {sundaySchoolMode && canBeAssignedToSundaySchool(
                          user.role,
                          user.roleAssignments?.map(assignment => assignment.tag) ?? []
                        ) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-2 h-7 px-2 text-xs"
                            onClick={() => setClassAssignmentUser(user)}
                          >
                            <School className="mr-1 h-3 w-3" />
                            Manage classes
                          </Button>
                        )}
                        <div className="text-xs text-gray-500 truncate">{user.email}</div>
                        {sundaySchoolLevels.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-blue-700">
                            Sunday School: {sundaySchoolLevels.map(getLevelDisplayName).join(', ')}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {isEditing ? (
                          <Button size="sm" variant="ghost" onClick={cancelForm} className="h-7 w-7 p-0">
                            <X className="h-4 w-4" />
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(user)} className="h-7 w-7 p-0">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteUser(user.id)} disabled={isCurrentUser} className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Inline Edit Form - Mobile */}
                    {isEditing && (
                      <div ref={editFormRef} className="border border-t-0 border-blue-200 dark:border-blue-800 rounded-b-md bg-blue-50/50 dark:bg-blue-950/10 p-3">
                        <form onSubmit={handleUpdateUser} className="space-y-3">
                          {formError && (
                            <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{formError}</div>
                          )}
                          {/* Photo */}
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 shrink-0">
                              {editingUser.profileImageUrl && (<AvatarImage src={editingUser.profileImageUrl} alt={editingUser.name} />)}
                              <AvatarFallback className="bg-maroon-600 text-white">{editingUser.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</AvatarFallback>
                            </Avatar>
                            <div className="flex gap-1.5">
                              <Button type="button" variant="outline" size="sm" disabled={uploadingPhoto} onClick={() => document.getElementById(`edit-user-photo-m-${editingUser.id}`)?.click()} className="h-7 px-2 text-xs gap-1">
                                <Camera className="h-3 w-3" /> {uploadingPhoto ? '...' : 'Photo'}
                              </Button>
                              {editingUser.profileImageUrl && (
                                <Button type="button" variant="outline" size="sm" disabled={uploadingPhoto} onClick={handleRemovePhoto} className="h-7 px-2 text-xs text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <input id={`edit-user-photo-m-${editingUser.id}`} type="file" accept="image/png,image/jpeg,image/jpg,image/gif" className="hidden" onChange={handlePhotoSelect} disabled={uploadingPhoto} />
                          </div>
                          {/* Fields */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="text-xs">Name</Label>
                              <Input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required className="h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Email</Label>
                              <Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required className="h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Phone</Label>
                              <Input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="Optional" className="h-8 text-sm" />
                            </div>
                            {!isSuperAdmin && (
                              <div>
                                <Label className="text-xs">Role</Label>
                                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })} className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-sm" required>
                                  {roleOptions.map(role => (<option key={role} value={role}>{getRoleDisplayName(role)}</option>))}
                                </select>
                              </div>
                            )}
                            {session?.user?.role === 'SUPER_ADMIN' && (
                              <div className="col-span-2">
                                <Label className="text-xs">New Password</Label>
                                <Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} placeholder="Leave blank to keep current" className="h-8 text-sm" />
                              </div>
                            )}
                          </div>
                          {isSuperAdmin && (
                            <div className="space-y-2 rounded-md border bg-background p-2">
                              <UserRoleTagEditor
                                value={formData.roleTags}
                                onChange={(roleTags) => setFormData({ ...formData, roleTags })}
                                compact
                              >
                                {!formData.roleTags.includes(RoleTag.SUPER_ADMIN) && (
                                  <ContactBookAccessSwitch
                                    checked={formData.canAccessContactBook}
                                    onChange={(canAccessContactBook) => setFormData({ ...formData, canAccessContactBook })}
                                    disabled={!!session?.impersonating}
                                  />
                                )}
                              </UserRoleTagEditor>
                              <div>
                                <Label className="text-xs">Audit note (optional)</Label>
                                <Input
                                  value={formData.roleAuditNote}
                                  onChange={(e) => setFormData({ ...formData, roleAuditNote: e.target.value })}
                                  placeholder="Why are these tags changing?"
                                  maxLength={500}
                                  className="h-8 text-sm"
                                />
                              </div>
                            </div>
                          )}
                          <div className="flex gap-2 justify-end">
                            <Button type="button" variant="outline" size="sm" onClick={cancelForm} className="h-8 text-xs">Cancel</Button>
                            <Button type="submit" size="sm" className="h-8 text-xs">Save</Button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )
              })}

              {users.length === 0 && (
                <EmptyState message={searchQuery || roleFilter ? 'No users match your search.' : 'No users yet.'} />
              )}
            </div>
          </div>
        </Panel>
      </div>

      {organizationUser && (
              <UserOrganizationDialog key={organizationUser.id} user={{ ...organizationUser, profileImageUrl: organizationUser.profileImageUrl ?? null }} onClose={() => setOrganizationUser(null)} />
            )}
      <SundaySchoolUserClassDialog
        user={classAssignmentUser}
        open={classAssignmentUser !== null}
        onOpenChange={open => {
          if (!open) setClassAssignmentUser(null)
        }}
        onAssignmentsChanged={async () => {
          const refreshedUsers = await fetchUsers(debouncedSearch, roleFilter)
          if (!classAssignmentUser || !refreshedUsers) return
          setClassAssignmentUser(
            refreshedUsers.find(user => user.id === classAssignmentUser.id) ?? null
          )
        }}
      />
            {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteUserId(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Enable/Disable Confirmation Dialog */}
      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === 'disable' ? 'Disable Users' : 'Enable Users'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === 'disable'
                ? `Are you sure you want to disable ${selectedUsers.size} user(s)? They will not be able to log in.`
                : `Are you sure you want to enable ${selectedUsers.size} user(s)? They will be able to log in again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setBulkAction(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkAction}
              className={bulkAction === 'disable' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
            >
              {bulkAction === 'disable' ? 'Disable' : 'Enable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Password Reset Dialog */}
      <AlertDialog open={passwordResetOpen} onOpenChange={setPasswordResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password for {selectedUsers.size} User(s)</AlertDialogTitle>
            <AlertDialogDescription>
              Enter a new password that will be set for all selected users. They will be prompted to change it on their next login.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 characters)"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setNewPassword('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmPasswordReset}
              disabled={!newPassword || newPassword.length < 6}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Crop Dialog */}
      {cropImageSrc && (
        <ImageCropDialog
          imageSrc={cropImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={() => { setCropImageSrc(null); setPendingPhotoFile(null) }}
        />
      )}
    </div>
  )
}
