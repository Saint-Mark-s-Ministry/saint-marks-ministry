import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { Guides } from '@/components/guides'
import { authOptions } from '@/lib/auth'
import { canViewGuides } from '@/lib/roles'

export const metadata: Metadata = {
  title: 'Guides | St. Mark Ministry Portal',
  description: 'Short videos and written steps for using the ministry portal.',
}

export default async function GuidesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!canViewGuides(session.user.role)) redirect('/dashboard')
  return <Guides />
}
