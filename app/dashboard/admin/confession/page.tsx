'use client'

import { PrepGuideLink } from '@/components/guides/prep-guide-link'

import { useAdminGuard } from '@/hooks/useAdminGuard'
import { isAdmin, canManageData } from '@/lib/roles'
import { PageLoading } from '@/components/ui/page-loading'
import { PageHeader } from '@/components/ds/page-header'
import { ConfessionTracker } from '@/components/admin/confession-tracker'

export default function ConfessionPage() {
  const { session, status } = useAdminGuard(isAdmin)

  if (status === 'loading' || !session?.user) {
    return <PageLoading />
  }

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader title="Confession" meta={['Father of confession sign-offs', 'two-month periods']} />
      <PrepGuideLink id="confession" />
      <ConfessionTracker canEdit={canManageData(session.user.role)} />
    </div>
  )
}
