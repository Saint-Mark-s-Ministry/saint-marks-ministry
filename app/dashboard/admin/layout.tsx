import type { ReactNode } from 'react'
import { StudentProfileProvider } from '@/components/student-profile-provider'

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <StudentProfileProvider>{children}</StudentProfileProvider>
}
