interface LastSavedProps {
  date: Date | null
  className?: string
}

export function LastSaved({ date, className }: LastSavedProps) {
  if (!date) return null

  return (
    <span className={`text-xs text-ink-3 ${className ?? ''}`}>
      Last saved {date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })}
    </span>
  )
}
