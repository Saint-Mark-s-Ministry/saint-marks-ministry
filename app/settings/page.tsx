'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getRoleDisplayName } from '@/lib/roles'
import { toast } from 'sonner'
import { Camera, Trash2 } from 'lucide-react'
import { ImageCropDialog } from '@/components/image-crop-dialog'
import { PageHeader } from '@/components/ds/page-header'

export default function SettingsPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()

  // Name change
  const [name, setName] = useState('')
  const [nameLoading, setNameLoading] = useState(false)

  // Profile picture
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [removingPhoto, setRemovingPhoto] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user) {
      setName(session.user.name || '')
    }
  }, [status, session, router])

  const handleNameUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameLoading(true)

    try {
      const res = await fetch(`/api/users/${session?.user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      if (res.ok) {
        await update({ name })
        toast.success('Name updated successfully!')
      } else {
        const error = await res.json()
        toast.error(`Failed to update name: ${error.error}`)
      }
    } catch (error) {
      console.error('Failed to update name:', error)
      toast.error('Failed to update name')
    } finally {
      setNameLoading(false)
    }
  }

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset input so re-selecting the same file works
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

    // Open crop dialog
    setPendingFile(file)
    const reader = new FileReader()
    reader.onload = () => setCropImageSrc(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleCropComplete = async (croppedBlob: Blob) => {
    setCropImageSrc(null)
    setUploadingPhoto(true)
    try {
      const fileName = pendingFile?.name || 'profile.jpg'
      const croppedFile = new File([croppedBlob], fileName, { type: 'image/jpeg' })
      const formData = new FormData()
      formData.append('file', croppedFile)

      const res = await fetch('/api/profile-picture/upload', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        await update({ profileImageUrl: data.url })
        toast.success('Profile picture updated!')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to upload photo')
      }
    } catch (error) {
      console.error('Failed to upload photo:', error)
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      setPendingFile(null)
    }
  }

  const handleCropCancel = () => {
    setCropImageSrc(null)
    setPendingFile(null)
  }

  const handleRemovePhoto = async () => {
    setRemovingPhoto(true)
    try {
      const res = await fetch(`/api/users/${session?.user?.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileImageUrl: null }),
      })

      if (res.ok) {
        await update({ profileImageUrl: null })
        toast.success('Profile picture removed!')
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to remove photo')
      }
    } catch (error) {
      console.error('Failed to remove photo:', error)
      toast.error('Failed to remove photo')
    } finally {
      setRemovingPhoto(false)
    }
  }

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }

    setPasswordLoading(true)

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      })

      if (res.ok) {
        toast.success('Password updated successfully!')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const error = await res.json()
        toast.error(`Failed to update password: ${error.error}`)
      }
    } catch (error) {
      console.error('Failed to update password:', error)
      toast.error('Failed to update password')
    } finally {
      setPasswordLoading(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col">
      <div className="w-full max-w-3xl space-y-5">
        {/* Header */}
        <PageHeader title="My account" meta={['Profile, name and password']} />

        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account information</CardTitle>
            <CardDescription>Your current account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Email:</span>
              <span className="text-sm font-medium">{session?.user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Role:</span>
              <span className="text-sm font-medium">
                {session?.user?.role && getRoleDisplayName(session.user.role)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Profile Picture */}
        <Card>
          <CardHeader>
            <CardTitle>Profile picture</CardTitle>
            <CardDescription>Update your profile photo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                {session?.user?.profileImageUrl && (
                  <AvatarImage src={session.user.profileImageUrl} alt={session.user.name || ''} />
                )}
                <AvatarFallback className="bg-maroon-600 text-white text-xl">
                  {session?.user?.name
                    ?.split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase() || '??'}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploadingPhoto}
                    onClick={() => document.getElementById('profile-photo-input')?.click()}
                    className="gap-1"
                  >
                    <Camera className="h-4 w-4" />
                    {uploadingPhoto ? 'Uploading...' : 'Change Photo'}
                  </Button>
                  {session?.user?.profileImageUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removingPhoto}
                      onClick={handleRemovePhoto}
                      className="gap-1 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                      {removingPhoto ? 'Removing...' : 'Remove'}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-gray-500">PNG, JPG, or GIF. Max 4.5 MB. Use a close-up of your face.</p>
                <input
                  id="profile-photo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/gif"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Crop Dialog */}
        {cropImageSrc && (
          <ImageCropDialog
            imageSrc={cropImageSrc}
            onCropComplete={handleCropComplete}
            onCancel={handleCropCancel}
          />
        )}

        {/* Update Name */}
        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
            <CardDescription>Change your display name</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleNameUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={nameLoading}
                />
              </div>
              <Button type="submit" disabled={nameLoading || name === session?.user?.name}>
                {nameLoading ? 'Updating...' : 'Update Name'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  disabled={passwordLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  disabled={passwordLoading}
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={passwordLoading}
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={passwordLoading}>
                {passwordLoading ? 'Updating...' : 'Change Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
