'use client'

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { StudentProfileModal } from '@/components/student-profile-modal'

const ProfileContext = createContext<((studentId: string, trigger: HTMLElement) => void) | null>(null)

export function useStudentProfileModal() {
  return useContext(ProfileContext)
}

export function StudentProfileProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentId] = useState<string | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const pathname = usePathname()

  useEffect(() => { setStudentId(null) }, [pathname])

  return (
    <ProfileContext.Provider value={(id, opener) => { if (!studentId) trigger.current = opener; setStudentId(id) }}>
      {children}
      {studentId && <StudentProfileModal studentId={studentId} onClose={() => setStudentId(null)} onRestoreFocus={() => {
        if (trigger.current?.isConnected) trigger.current.focus()
      }} />}
    </ProfileContext.Provider>
  )
}
