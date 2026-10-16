'use client'

import { useId } from 'react'

export function ViewAsAccessSwitch({ checked, onChange, disabled = false, hasAutomaticAccess = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  hasAutomaticAccess?: boolean
}) {
  const id = useId()
  const isDisabled = disabled || hasAutomaticAccess
  const isChecked = checked || hasAutomaticAccess
  return (
    <label htmlFor={id} className={`flex items-start gap-2 rounded-md border p-2 transition-colors ${isChecked ? 'border-maroon-500 bg-maroon-50 dark:border-maroon-400 dark:bg-maroon-950/30' : 'border-border bg-background hover:bg-muted/50'} ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input
        id={id}
        type="checkbox"
        checked={isChecked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 accent-maroon-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
      <span className="min-w-0">
        <span id={`${id}-label`} className="block text-xs font-medium">Allow View as</span>
        <span id={`${id}-description`} className="block text-[11px] leading-snug text-muted-foreground">{hasAutomaticAccess ? 'Super Admins already have View as access.' : 'Can use Ctrl Q to view the app as another user in read-only mode.'}</span>
      </span>
    </label>
  )
}
