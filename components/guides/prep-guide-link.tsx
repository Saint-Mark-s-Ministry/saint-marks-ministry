'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { CirclePlay } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePrepGuideAccess } from '@/lib/swr'

export function PrepGuideLink({ id, children = 'Watch guide' }: { id?: string; children?: React.ReactNode }) {
  const { data: session } = useSession()
  const { data } = usePrepGuideAccess(session?.user.id)
  if (!data?.allowed) return null
  return <Button asChild variant="outline" className="self-start"><Link href={`/dashboard/guides/servants-prep${id ? `#${id}` : ''}`}><CirclePlay aria-hidden />{children}</Link></Button>
}
