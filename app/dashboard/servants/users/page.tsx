'use client'

import UsersPage from '@/app/dashboard/admin/users/page'
import { PageLoading } from '@/components/ui/page-loading'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { canAdministerSundaySchool } from '@/lib/roles'

export default function SundaySchoolUsersPage() {
  const { session, status } = useAdminGuard(canAdministerSundaySchool)

  if (
    status !== 'authenticated' ||
    !session?.user?.role ||
    !canAdministerSundaySchool(session.user.role)
  ) {
    return <PageLoading />
  }

  return <UsersPage />
}
