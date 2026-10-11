'use client'

import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { PublicFrame } from '@/components/ds/public-frame'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { defaultDashboardPath } from '@/lib/dashboard-navigation'

export default function ChangePasswordPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.currentPassword) {
      newErrors.currentPassword = 'Current password is required'
    }

    if (!formData.newPassword) {
      newErrors.newPassword = 'New password is required'
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters'
    }

    if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = 'New password must be different from current password'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: formData.currentPassword,
          newPassword: formData.newPassword
        })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password')
      }

      // Replace the temporary-password JWT with a freshly authenticated one.
      // Updating the existing session in place can leave the password-change
      // claim in a stale browser cookie long enough for the first dashboard
      // requests to be rejected. This also preserves standalone MENTOR users:
      // their destination comes from the canonical role returned by the API,
      // not from ministry role tags they intentionally do not have.
      const email = session?.user?.email
      if (!email) {
        await signOut({ callbackUrl: '/login?passwordChanged=true' })
        return
      }

      const signInResult = await signIn('credentials', {
        email,
        password: formData.newPassword,
        redirect: false,
      })

      if (!signInResult?.ok || signInResult.error) {
        await signOut({ callbackUrl: '/login?passwordChanged=true' })
        return
      }

      toast.success('Password changed successfully!')

      const destination = typeof data.destination === 'string'
        ? data.destination
        : defaultDashboardPath(session?.user)
      router.replace(destination)
      router.refresh()
    } catch (error: unknown) {
      if (error instanceof Error) {
        toast.error(error.message)
      } else {
        toast.error('Failed to change password')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/login' })
  }

  return (
    <PublicFrame
      title="Change your password"
      description={
        session?.user?.mustChangePassword ? (
          <span className="font-medium text-warn">You must change your password before continuing.</span>
        ) : (
          'Update your password to keep your account secure.'
        )
      }
    >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                disabled={loading}
                aria-invalid={Boolean(errors.currentPassword)}
              />
              {errors.currentPassword && (
                <p className="text-xs text-bad">{errors.currentPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                value={formData.newPassword}
                onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                disabled={loading}
                aria-invalid={Boolean(errors.newPassword)}
                placeholder="Minimum 8 characters"
              />
              {errors.newPassword && (
                <p className="text-xs text-bad">{errors.newPassword}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                disabled={loading}
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-bad">{errors.confirmPassword}</p>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" size="lg" disabled={loading} className="flex-1">
                {loading ? 'Changing password…' : 'Change password'}
              </Button>
              {!session?.user?.mustChangePassword && (
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              )}
            </div>

            {session?.user?.mustChangePassword && (
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="cursor-pointer text-[13px] text-ink-2 underline hover:text-ink"
                >
                  Sign out instead
                </button>
              </div>
            )}
          </form>
    </PublicFrame>
  )
}
