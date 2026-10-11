import Image from 'next/image'
import type { Ministry } from '@/lib/navigation'
import { cn } from '@/lib/utils'

/** The ministry's logo tile. Servants Prep's mark sits on black; Sunday School's is full color. */
export function MinistryMark({ ministry, size = 32, className }: { ministry: Ministry; size?: number; className?: string }) {
  if (ministry === 'sunday-school') {
    return (
      <Image
        src="/sunday-school-favicon.png"
        alt=""
        width={size}
        height={size}
        className={cn('shrink-0 object-contain', className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-[7px] bg-black p-[3px]', className)}
      style={{ width: size, height: size }}
    >
      <Image src="/sp-logo.png" alt="" width={size} height={size} className="size-full object-contain" />
    </span>
  )
}
