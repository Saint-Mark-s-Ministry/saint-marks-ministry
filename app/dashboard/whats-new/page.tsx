import type { Metadata } from 'next'
import { WhatsNew } from '@/components/whats-new'

export const metadata: Metadata = {
  title: 'What’s new | St. Mark Ministry Portal',
  description: 'The latest features, improvements, and fixes for your ministry portal.',
}

export default function WhatsNewPage() {
  return <WhatsNew />
}
