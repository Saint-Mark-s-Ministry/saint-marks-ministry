import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-line-strong bg-surface text-ink placeholder:text-ink-3 selection:bg-brand selection:text-white focus-visible:border-accent-ink focus-visible:ring-accent-tint aria-invalid:border-bad flex field-sizing-content min-h-16 w-full rounded-md border px-2.5 py-2 text-base transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-[13.5px]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
