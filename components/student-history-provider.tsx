'use client'

import { createContext, useContext, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { StudentHistoryProgram, StudentHistoryTarget } from '@/lib/student-history'
import { cn } from '@/lib/utils'

const StudentHistoryDialog = dynamic(() => import('@/components/student-history-dialog'))
const HistoryContext = createContext<((target: StudentHistoryTarget, trigger: HTMLElement) => void) | null>(null)

export function useStudentHistoryOpener() {
  return useContext(HistoryContext)
}

export function StudentHistoryProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<StudentHistoryTarget | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  return <HistoryContext.Provider value={(next, opener) => { trigger.current = opener; setTarget(next) }}>
    {children}
    {target && <StudentHistoryDialog key={`${target.program}:${target.id}`} target={target} onClose={() => setTarget(null)} onRestoreFocus={() => {
      if (trigger.current?.isConnected) trigger.current.focus()
    }} />}
  </HistoryContext.Provider>
}

/** Use IDs and an explicit program: names need not be unique across either roster. */
export function StudentName({ id, name, program = 'prep', className, children }: {
  id: string
  name: string
  program?: StudentHistoryProgram
  className?: string
  children?: React.ReactNode
}) {
  const open = useStudentHistoryOpener()
  return <button type="button" aria-label={`View history for ${name}`} aria-haspopup="dialog"
    className={cn('min-h-11 cursor-pointer rounded-sm text-left font-medium text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink md:min-h-0', className)}
    onClick={event => {
      event.stopPropagation()
      open?.({ id, name, program }, event.currentTarget)
    }}>
    {children ?? name}
  </button>
}
