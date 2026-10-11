import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sunday School | St. Mark Church',
  icons: {
    icon: [
      {
        url: '/sunday-school-favicon-32.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/sunday-school-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/sunday-school-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    shortcut: '/sunday-school-favicon-32.png',
    apple: {
      url: '/sunday-school-apple-touch-icon-v2.png',
      sizes: '180x180',
      type: 'image/png',
    },
  },
}

export default function SundaySchoolLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
