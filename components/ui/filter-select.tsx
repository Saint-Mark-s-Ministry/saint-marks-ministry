interface FilterSelectOption {
  value: string
  label: string
}

interface FilterSelectProps {
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
  placeholder?: string
  className?: string
  'aria-label'?: string
}

export function FilterSelect({ value, onChange, options, placeholder, className, 'aria-label': ariaLabel }: FilterSelectProps) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`h-11 cursor-pointer rounded-md border border-line-strong bg-surface pr-7 pl-2.5 text-base font-medium text-ink outline-none focus-visible:border-accent-ink focus-visible:ring-[3px] focus-visible:ring-accent-tint md:h-8 md:text-[13px] ${className ?? ''}`}
    >
      {placeholder && <option value="all">{placeholder}</option>}
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
