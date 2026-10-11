'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export function LegalHeader() {
  const { status } = useSession()
  const pathname = usePathname()

  // Inside the app shell (/dashboard/servants/privacy) the shell is the navigation.
  if (pathname.startsWith('/dashboard')) return null
  const signedIn = status === 'authenticated'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href={signedIn ? '/dashboard' : '/login'} className="group flex items-center gap-3 text-ink no-underline">
          <Image
            src="/st-mark-logo.png"
            alt="St. Mark Coptic Orthodox Church Logo"
            width={42}
            height={36}
            className="h-9 w-auto object-contain"
          />
          <div className="leading-tight">
            <p className="font-display text-[17px] font-medium">St. Mark Ministry Portal</p>
          </div>
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link
            href={signedIn ? '/dashboard' : '/login'}
            className="inline-flex h-11 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 text-[13px] font-medium text-ink no-underline hover:bg-hover md:h-8"
          >
            <ArrowLeft className="size-4" />
            {signedIn ? 'Back to portal' : 'Sign in'}
          </Link>
        </div>
      </div>
    </header>
  )
}
