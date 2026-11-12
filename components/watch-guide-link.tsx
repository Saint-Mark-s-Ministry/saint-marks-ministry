import Link from 'next/link'
import { CirclePlay } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function WatchGuideLink({ href }: { href: string }) {
  return <Button asChild variant="outline"><Link href={href}><CirclePlay aria-hidden />Watch guide</Link></Button>
}
