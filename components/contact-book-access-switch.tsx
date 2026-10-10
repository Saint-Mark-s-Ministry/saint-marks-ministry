'use client'

import { useId } from 'react'

export function ContactBookAccessSwitch({ checked, onChange, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={`inline-flex w-fit max-w-full items-start gap-2 py-2 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
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
        <span id={`${id}-label`} className="block text-sm font-medium text-ink">Allow contact book access</span>
        <span id={`${id}-description`} className="block text-xs text-ink-3">Can view all app users’ names, emails, and phone numbers.</span>
      </span>
    </label>
  )
}
