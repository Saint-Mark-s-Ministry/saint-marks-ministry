'use client'

import { SundaySchoolHubTabs } from '@/components/sunday-school-hub-tabs'

/** Care keeps Follow up, Visits & calls and Birthdays under one menu entry. */
export function CareHubTabs({ followUpCount }: { followUpCount?: number }) {
  return (
    <SundaySchoolHubTabs
      label="Care"
      tabs={[
        { href: '/dashboard/servants/care', label: 'Follow up', count: followUpCount },
        { href: '/dashboard/servants/visitations', label: 'Visits & calls' },
        { href: '/dashboard/servants/birthdays', label: 'Birthdays' },
      ]}
    />
  )
}
