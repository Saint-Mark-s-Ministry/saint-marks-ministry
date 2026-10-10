'use client'

import { useId } from 'react'

export function ContactBookAccessSwitch({ checked, onChange, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface p-3">
      <div>
        <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium text-ink">Allow contact book access</label>
        <p id={`${id}-description`} className="text-xs text-ink-3">Can view all app users’ names, emails, and phone numbers.</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-ink-3'}`}
      >
        <span className={`size-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}
