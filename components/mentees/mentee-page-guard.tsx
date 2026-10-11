'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Session } from 'next-auth'
import { useMenteePageAccess } from '@/lib/swr'
import { prepHome } from '@/lib/navigation'
import { EmptyState } from '@/components/ui/empty-state'
import { PageLoading } from '@/components/ui/page-loading'

export function MenteePageGuard({ session, children }: { session: Session; children: React.ReactNode }) {
  const router = useRouter()
  const { hasMentees, data, error } = useMenteePageAccess(session.user)

  useEffect(() => {
    if (data && !hasMentees) router.replace(prepHome(session.user.role))
  }, [data, hasMentees, router, session.user.role])

  if (error) return <EmptyState title="Unable to load mentees" message="Please refresh the page to try again." />
  if (!hasMentees) return <PageLoading />
  return <>{children}</>
}
