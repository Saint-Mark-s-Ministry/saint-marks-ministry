'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { BellRing, X } from 'lucide-react'
import { subscribeToPush, getPushPermissionState, isPushSubscribed } from '@/lib/push-client'
import { toast } from 'sonner'

/**
 * Shows a banner prompting the user to enable push notifications.
 * Only shows if:
 * - User is logged in
 * - Push is supported
 * - Permission hasn't been denied
 * - User hasn't been subscribed yet
 * - User hasn't dismissed the prompt
 */
export function PushNotificationPrompt() {
  const { data: session } = useSession()
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    if (!session?.user) return

    const dismissed = localStorage.getItem('push-prompt-dismissed')
    if (dismissed) return

    const checkSubscription = async () => {
      const { supported, permission } = getPushPermissionState()
      if (!supported || permission === 'denied') return

      const subscribed = await isPushSubscribed()
      if (!subscribed && permission !== 'granted') {
        // Delay showing the prompt to not overwhelm users on login
        setTimeout(() => setShowPrompt(true), 3000)
      }
    }

    checkSubscription()
  }, [session])

  const handleEnable = async () => {
    const result = await subscribeToPush()
    if (result.success) {
      toast.success('Push notifications enabled!')
      setShowPrompt(false)
    } else {
      toast.error(result.reason ?? 'Failed to enable notifications.')
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('push-prompt-dismissed', Date.now().toString())
  }

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom)+12px)] left-4 right-4 sm:left-auto sm:right-4 sm:w-96 md:bottom-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="rounded-lg border bg-card text-card-foreground shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-primary/10 p-2">
            <BellRing className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold">Enable Notifications</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Get notified about grades, attendance, lesson updates, and more — even when you&apos;re not using the app.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={handleEnable}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Enable
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 rounded p-1 hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  )
}
