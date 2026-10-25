'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SessionProvider, signOut, useSession } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { Button } from '@/components/ui/button'

function SessionBoundary({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const invalidSession = status === 'authenticated' && !session?.user
  const recoveryStarted = useRef(false)
  const [recoveryFailed, setRecoveryFailed] = useState(false)

  const recoverSession = useCallback(async () => {
    setRecoveryFailed(false)
    try {
      // Clear the revoked cookie and reload the app with a fresh login page.
      await signOut({ callbackUrl: '/login' })
    } catch {
      setRecoveryFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!invalidSession) {
      recoveryStarted.current = false
      return
    }
    if (recoveryStarted.current) return
    recoveryStarted.current = true
    void recoverSession()
  }, [invalidSession, recoverSession])

  // NextAuth v4 calls any non-null session "authenticated", even after our
  // callback strips its user on revocation. Block consumers during recovery:
  // they must never render with an authenticated session lacking a user.
  if (invalidSession) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas text-[13px] text-ink-3">
        <p role="status">Your session has ended. {recoveryFailed ? 'Please try signing in again.' : 'Taking you to sign in…'}</p>
        {recoveryFailed && <Button onClick={() => void recoverSession()}>Try again</Button>}
      </div>
    )
  }

  return children
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionProvider><SessionBoundary>{children}</SessionBoundary></SessionProvider>
    </ThemeProvider>
  )
}
