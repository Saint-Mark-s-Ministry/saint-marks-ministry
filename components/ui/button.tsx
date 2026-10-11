import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Buttons are 32px on desktop and 44px on touch screens (design system §04).
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-md text-[15px] md:text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink aria-invalid:border-bad cursor-pointer",
  {
    variants: {
      variant: {
        default: "border border-brand bg-brand text-white hover:bg-brand-hover hover:border-brand-hover",
        destructive: "border border-line-strong bg-transparent text-bad hover:bg-bad-tint",
        outline: "border border-line-strong bg-surface text-ink hover:bg-hover",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-hover",
        ghost: "text-ink-2 hover:bg-hover hover:text-ink",
        link: "text-accent-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 md:h-8 md:px-3",
        sm: "h-9 gap-1.5 px-3 text-[13px] md:h-[30px] md:text-[12.5px]",
        lg: "h-11 px-4 text-[15px]",
        icon: "size-11 md:size-8",
        "icon-sm": "size-9 md:size-[30px]",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
