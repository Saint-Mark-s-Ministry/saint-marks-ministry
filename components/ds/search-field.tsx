'use client'

import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  label,
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex h-11 w-full items-center gap-2 rounded-md border border-line-strong bg-surface px-2.5 text-ink-3 focus-within:border-accent-ink focus-within:ring-[3px] focus-within:ring-accent-tint md:h-8 md:w-[200px]',
        className
      )}
    >
      <Search className="size-[15px] shrink-0" aria-hidden />
      <span className="sr-only">{label ?? placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 md:text-[13px]"
      />
    </label>
  )
}
