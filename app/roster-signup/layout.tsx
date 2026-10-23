import type { Metadata } from 'next'

// A roster token is a temporary capability, not a page for indexing or sharing
// with third-party referrers.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function RosterLinkLayout({ children }: { children: React.ReactNode }) {
  return children
}
