"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { useModalExit } from "@/hooks/use-modal-exit"
import { useAnimatedSize } from "@/hooks/use-animated-size"
import { useDialogViewport } from "@/hooks/use-dialog-viewport"

function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const requestedOpen = open ?? uncontrolledOpen
  const exit = useModalExit(() => {
    if (open === undefined) setUncontrolledOpen(false)
    onOpenChange?.(false)
  })
  const isOpen = requestedOpen && !exit.closing
  const visibleChildren = React.useRef<React.ReactNode>(children)

  // Keep the last open contents mounted while Radix plays the closing animation.
  // This prevents record-backed dialogs from becoming empty before they fade out.
  if (isOpen) visibleChildren.current = children

  return (
    <DialogPrimitive.Root
      data-slot="dialog"
      open={isOpen}
      onOpenChange={nextOpen => {
        if (!nextOpen) { exit.close(); return }
        exit.cancel()
        if (open === undefined) setUncontrolledOpen(true)
        onOpenChange?.(true)
      }}
      {...props}
    >
      {isOpen ? children : visibleChildren.current}
    </DialogPrimitive.Root>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:[animation-duration:var(--modal-motion-duration)] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-[rgba(19,18,17,0.45)] motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

/** Unstyled modal surface for custom dialogs; shares automatic resize motion. */
function DialogSurface({
  ref,
  className,
  animateResize = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { animateResize?: boolean }) {
  const animatedRef = useAnimatedSize(ref)
  return <DialogPrimitive.Content ref={animateResize ? animatedRef : ref} className={cn("data-[state=closed]:[animation-duration:var(--modal-motion-duration)] motion-reduce:animate-none", className)} {...props} />
}

function DialogContent({
  ref,
  className,
  children,
  showCloseButton = true,
  scrollable = false,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** Keep a close bar outside the scrolling body and fit the visible viewport. */
  scrollable?: boolean
}) {
  const viewportStyle = useDialogViewport(scrollable)
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogSurface
        ref={ref}
        animateResize={!scrollable}
        data-slot="dialog-content"
        className={cn(
          "bg-surface text-ink border-line data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:[animation-duration:var(--modal-motion-duration)] data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed z-50 rounded-xl border shadow-[0_24px_60px_-20px_rgba(27,24,23,0.35)] duration-200 motion-reduce:animate-none sm:max-w-lg",
          scrollable
            ? "dialog-scrollable flex max-w-lg flex-col overflow-hidden"
            : "top-[50%] left-[50%] grid content-start w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6",
          className
        )}
        style={{ ...style, ...viewportStyle }}
        {...props}
      >
        {scrollable && showCloseButton && (
          <div className="flex shrink-0 justify-end border-b border-line bg-surface px-2 py-1">
            <DialogPrimitive.Close data-slot="dialog-close" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
              Close
              <XIcon className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
        )}
        {scrollable
          ? <div data-slot="dialog-scroll-body" className="grid min-h-0 gap-4 overflow-y-auto overscroll-contain p-6">{children}</div>
          : children}
        {!scrollable && showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogSurface>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogSurface,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
