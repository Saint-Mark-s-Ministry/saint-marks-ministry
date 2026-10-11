'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { MenteePageGuard } from '@/components/mentees/mentee-page-guard'
import { MenteesView } from '@/components/mentees/mentees-view'

export default function MenteesPage() {
  const { session, status } = useAdminGuard(isAdmin)
  if (status === 'loading' || !session?.user) return <PageLoading />
  return <MenteePageGuard session={session}><MenteesView session={session} /></MenteePageGuard>
}
