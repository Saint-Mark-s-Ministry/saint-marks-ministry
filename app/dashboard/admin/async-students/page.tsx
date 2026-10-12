'use client'

import { PageLoading } from '@/components/ui/page-loading'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isAdmin, isReadOnlyAdmin, canManageSundaySchool, canManageSundaySchoolAttendance } from '@/lib/roles'
import { PageHeader } from '@/components/ds/page-header'
import { SundaySchoolPanel } from '@/components/admin/sunday-school-panel'

export default function AsyncStudentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated' && !isAdmin(session?.user?.role)) {
      router.push('/dashboard')
    }
  }, [status, session, router])

  if (status === 'loading' || !session?.user || !isAdmin(session.user.role)) {
    return <PageLoading />
  }

  const role = session.user.role
  const readOnly = isReadOnlyAdmin(role)

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Async students"
        meta={['Review student-uploaded rotation forms and manage serving assignments']}
      />

      <SundaySchoolPanel
        canManage={canManageSundaySchool(role)}
        canManageAttendance={canManageSundaySchoolAttendance(role)}
        readOnly={readOnly}
      />
    </div>
  )
}
