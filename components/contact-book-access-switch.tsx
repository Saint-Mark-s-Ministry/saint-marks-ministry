'use client'

import { useId } from 'react'

export function ContactBookAccessSwitch({ checked, onChange, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={`flex items-start gap-2 rounded-md border p-2 transition-colors ${checked ? 'border-maroon-500 bg-maroon-50 dark:border-maroon-400 dark:bg-maroon-950/30' : 'border-border bg-background hover:bg-muted/50'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-maroon-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-xs font-medium">Allow contact book access</span>
        <span id={`${id}-description`} className="block text-[11px] leading-snug text-muted-foreground">Can view all app users’ names, emails, and phone numbers.</span>
      </span>
    </label>
  )
}
