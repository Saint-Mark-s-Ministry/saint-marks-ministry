'use client'

import UsersPage from '@/app/dashboard/admin/users/page'
import { PageLoading } from '@/components/ui/page-loading'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { canManageAllUsers } from '@/lib/roles'

export default function SundaySchoolUsersPage() {
  const { session, status } = useAdminGuard(canManageAllUsers)

  if (
    status !== 'authenticated' ||
    !session?.user?.role ||
    !canManageAllUsers(session.user.role)
  ) {
    return <PageLoading />
  }

  return <UsersPage />
}
