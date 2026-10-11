import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-ink border-line-strong bg-surface text-ink placeholder:text-ink-3 selection:bg-brand selection:text-white h-11 w-full min-w-0 rounded-md border px-2.5 text-base transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-[13.5px]",
        "focus-visible:border-accent-ink focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-tint",
        "aria-invalid:border-bad aria-invalid:ring-bad-tint",
        className
      )}
      {...props}
    />
  )
}

export { Input }
