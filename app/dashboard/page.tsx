'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { defaultDashboardPath } from '@/lib/dashboard-navigation'

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated') {
      // Check if user must change password first
      if (session?.user?.mustChangePassword) {
        router.push('/change-password')
        return
      }

      router.replace(defaultDashboardPath(session?.user))
    }
  }, [status, session, router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-lg">Loading...</div>
    </div>
  )
}
