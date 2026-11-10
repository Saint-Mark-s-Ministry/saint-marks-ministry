import type { Metadata } from 'next'
import { Guides } from '@/components/guides'

export const metadata: Metadata = {
  title: 'Guides | St. Mark Ministry Portal',
  description: 'Short videos and written steps for using the ministry portal.',
}

export default function GuidesPage() {
  return <Guides />
}
