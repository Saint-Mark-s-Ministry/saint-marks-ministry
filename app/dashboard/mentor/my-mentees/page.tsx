'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { canViewStudents } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { MenteesView } from '@/components/mentees/mentees-view'

export default function MyMenteesPage() {
  const { session, status } = useAdminGuard(canViewStudents)
  if (status === 'loading' || !session?.user) return <PageLoading />
  return <MenteesView session={session} />
}
