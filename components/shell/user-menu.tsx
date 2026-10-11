'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import type { UserRole } from '@prisma/client'
import type { Ministry } from '@/lib/navigation'
import { isAdmin } from '@/lib/roles'

/** Account links shared by the sidebar's user menu and the phone "More" sheet. */
export function accountLinks(role: UserRole, ministry: Ministry) {
  const inSundaySchool = ministry === 'sunday-school'
  const links: { href: string; label: string }[] = [
    { href: inSundaySchool && role !== 'PARENT' ? '/dashboard/servants/account' : '/settings', label: 'My account' },
  ]
  if (!inSundaySchool && isAdmin(role)) links.push({ href: '/dashboard/admin/settings', label: 'Program settings' })
  links.push({ href: '/change-password', label: 'Change password' })
  links.push({ href: inSundaySchool ? '/dashboard/servants/privacy' : '/privacy', label: 'Privacy Policy' })
  links.push({ href: inSundaySchool ? '/dashboard/servants/terms' : '/terms', label: 'Terms of Service' })
  return links
}

export function UserMenuItems({ role, ministry }: { role: UserRole; ministry: Ministry }) {
  return (
    <>
      {accountLinks(role, ministry).map((link) => (
        <DropdownMenuItem key={link.href} asChild>
          <Link href={link.href} className="cursor-pointer">
            {link.label}
          </Link>
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        className="cursor-pointer text-bad focus:text-bad"
        onClick={() => signOut({ callbackUrl: '/login' })}
      >
        Sign out
      </DropdownMenuItem>
    </>
  )
}
