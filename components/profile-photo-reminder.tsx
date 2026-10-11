'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { X, Camera } from 'lucide-react'

const LEGACY_DISMISS_KEY = 'profile-photo-reminder-dismissed'

function getDismissKey(userId: string) {
  return `profile-photo-reminder-dismissed:${userId}`
}

export function ProfilePhotoReminder() {
  const { data: session, status } = useSession()
  const [dismissed, setDismissed] = useState(true) // default hidden to avoid flash
  const userId = session?.user?.id
  const isViewingAs = Boolean(session?.impersonating)

  useEffect(() => {
    // Dismissals used to be permanent and shared by every account using this
    // browser. Remove that preference so the reminder returns as intended.
    try {
      localStorage.removeItem(LEGACY_DISMISS_KEY)
    } catch {
      // Storage can be unavailable in privacy-restricted browsers.
    }

    if (status !== 'authenticated' || !userId) {
      setDismissed(true)
      return
    }

    // View as is read-only, so an administrator should never be able to hide a
    // reminder on behalf of the student they are viewing.
    if (isViewingAs) {
      setDismissed(false)
      return
    }

    try {
      setDismissed(sessionStorage.getItem(getDismissKey(userId)) === 'true')
    } catch {
      setDismissed(false)
    }
  }, [isViewingAs, status, userId])

  if (status !== 'authenticated') return null
  if (!session?.user) return null

  // Only show for students
  if (session.user.role !== 'STUDENT') return null

  // Already has a profile photo - don't show
  if (session.user.profileImageUrl) return null

  // User dismissed the reminder
  if (dismissed) return null

  const handleDismiss = () => {
    if (isViewingAs) return

    try {
      sessionStorage.setItem(getDismissKey(session.user.id), 'true')
    } catch {
      // Still hide it for the current render if storage is unavailable.
    }
    setDismissed(true)
  }

  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-warn/35 bg-warn-tint px-4 py-2.5 text-ink print:hidden">
      <Camera className="size-4 shrink-0 text-warn" strokeWidth={1.75} aria-hidden />
      <p className="flex-1 text-[13px] leading-5 text-ink-2">
        Add a profile photo so your mentors and servants can recognize you.{' '}
        <Link href="/settings" className="font-medium text-ink underline underline-offset-2">
          Go to Settings
        </Link>
      </p>
      {!isViewingAs && (
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink"
          aria-label="Dismiss reminder"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
