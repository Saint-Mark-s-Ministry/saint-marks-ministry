'use client'

import { useId } from 'react'

export function MakeupNotificationSwitch({ checked, onChange, eligible, disabled = false }: {
  checked: boolean
  onChange: (checked: boolean) => void
  eligible: boolean
  disabled?: boolean
}) {
  const id = useId()
  return <label htmlFor={id} className="flex items-start gap-2 rounded-md border border-border bg-background p-2">
    <input id={id} type="checkbox" checked={checked} disabled={disabled || (!eligible && !checked)}
      onChange={event => onChange(event.target.checked)} aria-labelledby={`${id}-label`} aria-describedby={`${id}-description`}
      className="mt-0.5 h-4 w-4 shrink-0 accent-maroon-600" />
    <span className="min-w-0">
      <span id={`${id}-label`} className="block text-xs font-medium">Makeup exam notifications</span>
      <span id={`${id}-description`} className="block text-[11px] leading-snug text-muted-foreground">
        {eligible ? 'Receive booking and reschedule emails, in-app alerts, and push where enabled.' : 'Requires an enabled account with Servants Prep staff or priest access.'}
      </span>
    </span>
  </label>
}
