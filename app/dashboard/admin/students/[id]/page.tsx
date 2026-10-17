'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import StudentsManagementPage from '../page'
import { StudentProfileModal } from '@/components/student-profile-modal'

// Shared/bookmarked profile URLs also open as a modal over the student list.
export default function StudentProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  return <>
    <StudentsManagementPage />
    <StudentProfileModal studentId={id} onClose={() => router.replace('/dashboard/admin/students')} />
  </>
}
