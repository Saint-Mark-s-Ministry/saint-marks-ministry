'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { isAdmin, isReadOnlyAdmin, canManageData, canManageSundaySchool, canManageSundaySchoolAttendance } from '@/lib/roles'
import { PageHeader } from '@/components/ds/page-header'
import { AttendanceSlipsPanel } from '@/components/admin/attendance-slips-panel'
import { SundaySchoolPanel } from '@/components/admin/sunday-school-panel'

export default function AsyncStudentsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('slips')

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (status === 'authenticated' && !isAdmin(session?.user?.role)) {
      router.push('/dashboard')
    }
  }, [status, session, router])

  if (status === 'loading' || !session?.user || !isAdmin(session.user.role)) {
    return null
  }

  const role = session.user.role
  const readOnly = isReadOnlyAdmin(role)

  return (
    <div className="content-reveal flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Async students"
        meta={['Signed attendance slips and Sunday School serving assignments']}
      />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="slips">Attendance slips</TabsTrigger>
            <TabsTrigger value="sunday-school">Sunday School</TabsTrigger>
          </TabsList>

          <TabsContent value="slips" className="mt-4">
            <AttendanceSlipsPanel canEdit={canManageData(role)} />
          </TabsContent>

          <TabsContent value="sunday-school" className="mt-4">
            <SundaySchoolPanel
              canManage={canManageSundaySchool(role)}
              canManageAttendance={canManageSundaySchoolAttendance(role)}
              readOnly={readOnly}
            />
          </TabsContent>
        </Tabs>
    </div>
  )
}
