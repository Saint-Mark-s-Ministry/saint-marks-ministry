import Link from 'next/link'
import { cn } from '@/lib/utils'

export function ServantAttendanceNavigation({ active }: { active: 'classes' | 'meetings' }) {
  return (
    <nav aria-label="Servant attendance sections" className="flex flex-wrap gap-1 border-b border-line">
      {[
        { id: 'classes', label: 'Class attendance', href: '/dashboard/servants/servant-attendance' },
        { id: 'meetings', label: 'Servants meetings', href: '/dashboard/servants/servant-attendance/meetings' },
      ].map(item => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active === item.id ? 'page' : undefined}
          className={cn('border-b-2 px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
            active === item.id ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:border-line hover:text-ink')}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
