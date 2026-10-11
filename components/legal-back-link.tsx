'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft } from 'lucide-react'
import {
  getLegalReturnLabel,
  getSafeLegalReturnPath,
  LEGAL_RETURN_PATH_KEY,
} from '@/lib/legal-navigation'

export function LegalBackLink() {
  const pathname = usePathname()
  const { status } = useSession()
  const inSundaySchoolMode = pathname.startsWith('/dashboard/servants')
  const fallbackHref = inSundaySchoolMode ? '/dashboard/servants' : '/dashboard'
  const fallbackLabel = inSundaySchoolMode ? 'Sunday School' : 'Dashboard'
  const [destination, setDestination] = useState({
    href: fallbackHref,
    label: fallbackLabel,
  })

  useEffect(() => {
    const returnPath = getSafeLegalReturnPath(
      sessionStorage.getItem(LEGAL_RETURN_PATH_KEY),
      inSundaySchoolMode
    )
    setDestination({
      href: returnPath ?? fallbackHref,
      label: getLegalReturnLabel(returnPath, inSundaySchoolMode),
    })
  }, [fallbackHref, fallbackLabel, inSundaySchoolMode])

  // Signed-out legal pages already provide a return-to-sign-in action in their
  // public header. This link is for returning authenticated users to their
  // active workspace without accidentally changing modes.
  if (status !== 'authenticated') return null

  return (
    <Link
      href={destination.href}
      onClick={() => sessionStorage.removeItem(LEGAL_RETURN_PATH_KEY)}
      className="mb-6 inline-flex items-center gap-1 text-[13px] text-ink-2 no-underline hover:text-ink"
    >
      <ArrowLeft className="size-3.5" />
      Back to {destination.label}
    </Link>
  )
}
