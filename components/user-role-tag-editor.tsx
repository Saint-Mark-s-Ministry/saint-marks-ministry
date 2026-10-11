'use client'

import type { ReactNode } from 'react'
import { RoleTag } from '@prisma/client'
import { ROLE_TAG_OPTIONS } from '@/lib/role-tags'

interface UserRoleTagEditorProps {
  value: RoleTag[]
  onChange: (value: RoleTag[]) => void
  disabled?: boolean
  compact?: boolean
  children?: ReactNode
}

export function UserRoleTagEditor({
  value,
  onChange,
  disabled = false,
  compact = false,
  children,
}: UserRoleTagEditorProps) {
  const selected = new Set(value)

  const toggle = (tag: RoleTag) => {
    if (selected.has(tag)) {
      onChange(value.filter((current) => current !== tag))
    } else {
      onChange([...value, tag])
    }
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className={compact ? 'text-xs font-medium' : 'text-sm font-medium'}>
        Access tags
      </legend>
      <p className="text-xs text-muted-foreground">
        Select every program this person belongs to. Mentor and coordinator access comes from assignments, not tags.
      </p>
      <div className={`grid gap-2 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'sm:grid-cols-2 xl:grid-cols-3'}`}>
        {ROLE_TAG_OPTIONS.map((option) => {
          const checked = selected.has(option.value)
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 transition-colors ${
                checked
                  ? 'border-maroon-500 bg-maroon-50 dark:border-maroon-400 dark:bg-maroon-950/30'
                  : 'border-border bg-background hover:bg-muted/50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.value)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-maroon-600"
              />
              <span className="min-w-0">
                <span className="block text-xs font-medium">{option.label}</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </label>
          )
        })}
        {children}
      </div>
    </fieldset>
  )
}
