'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { StudentHistoryProvider } from '@/components/student-history-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionProvider><StudentHistoryProvider>{children}</StudentHistoryProvider></SessionProvider>
    </ThemeProvider>
  )
}
