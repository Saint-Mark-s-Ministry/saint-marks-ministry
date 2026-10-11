'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { MenteesView } from '@/components/mentees/mentees-view'

export default function MenteesPage() {
  const { session, status } = useAdminGuard(isAdmin)
  if (status === 'loading' || !session?.user) return <PageLoading />
  return <MenteesView session={session} />
}
