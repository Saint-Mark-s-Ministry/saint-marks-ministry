'use client'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { canViewStudents } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { MenteePageGuard } from '@/components/mentees/mentee-page-guard'
import { MenteesView } from '@/components/mentees/mentees-view'

export default function MyMenteesPage() {
  const { session, status } = useAdminGuard(canViewStudents)
  if (status === 'loading' || !session?.user) return <PageLoading />
  return <MenteePageGuard session={session}><MenteesView session={session} /></MenteePageGuard>
}
