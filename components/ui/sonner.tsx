"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"
import { cn } from "@/lib/utils"

const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const
export type ToastCorner = (typeof CORNERS)[number]

const STORAGE_KEY = "toast-position"
const DESKTOP = "(min-width: 768px) and (pointer: fine)"
const DRAG_THRESHOLD_PX = 6

/** The corner of the viewport nearest to a point. */
export function cornerAt(x: number, y: number, width: number, height: number): ToastCorner {
  return `${y < height / 2 ? "top" : "bottom"}-${x < width / 2 ? "left" : "right"}`
}

function readSavedCorner(): ToastCorner {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (CORNERS.includes(saved as ToastCorner)) return saved as ToastCorner
  } catch {
    // Storage can be unavailable (private mode); use the default.
  }
  return "bottom-right"
}

/**
 * App toasts. On desktop a toast can be dragged to any corner; the choice is
 * remembered in this browser. Phones keep swipe-to-dismiss at the bottom.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const [position, setPosition] = useState<ToastCorner>("bottom-right")
  const [dropTarget, setDropTarget] = useState<ToastCorner | null>(null)
  const [desktop, setDesktop] = useState(false)

  useEffect(() => setPosition(readSavedCorner()), [])

  useEffect(() => {
    const media = window.matchMedia(DESKTOP)
    const sync = () => setDesktop(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    if (!desktop) return
    let drag: { x: number; y: number; list: HTMLElement; moved: boolean } | null = null

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Element)) return
      if (event.target.closest("button, a, input, textarea, select")) return
      const toast = event.target.closest("[data-sonner-toast]")
      const list = toast?.closest<HTMLElement>("[data-sonner-toaster]")
      if (list) drag = { x: event.clientX, y: event.clientY, list, moved: false }
    }

    const onMove = (event: PointerEvent) => {
      if (!drag) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      drag.list.style.translate = `${dx}px ${dy}px`
      document.documentElement.dataset.toastDragging = "true"
      setDropTarget(cornerAt(event.clientX, event.clientY, window.innerWidth, window.innerHeight))
    }

    const onUp = (event: PointerEvent) => {
      if (!drag) return
      const { list, moved } = drag
      drag = null
      list.style.translate = ""
      delete document.documentElement.dataset.toastDragging
      setDropTarget(null)
      if (!moved) return
      const corner = cornerAt(event.clientX, event.clientY, window.innerWidth, window.innerHeight)
      setPosition(corner)
      try {
        window.localStorage.setItem(STORAGE_KEY, corner)
      } catch {
        // Not persisted; it still applies for this visit.
      }
    }

    document.addEventListener("pointerdown", onDown, true)
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    document.addEventListener("pointercancel", onUp)
    return () => {
      document.removeEventListener("pointerdown", onDown, true)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onUp)
    }
  }, [desktop])

  return (
    <>
      <Sonner
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        position={desktop ? position : "bottom-right"}
        // Dragging replaces swipe-to-dismiss on desktop.
        swipeDirections={desktop ? [] : undefined}
        // Clear the 52px top bar and the sidebar (--sidebar-width, globals.css).
        offset={{ top: 68, right: 24, bottom: 24, left: "calc(var(--sidebar-width) + 24px)" }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
          } as React.CSSProperties
        }
        {...props}
      />
      {dropTarget && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[60]">
          {CORNERS.map((corner) => (
            <div
              key={corner}
              style={corner.endsWith("left") ? { left: "calc(var(--sidebar-width) + 16px)" } : undefined}
              className={cn(
                "absolute h-20 w-[356px] rounded-[10px] border-2 border-dashed transition-colors",
                corner.startsWith("top") ? "top-[60px]" : "bottom-4",
                corner.endsWith("right") && "right-4",
                corner === dropTarget ? "border-accent-ink bg-accent-tint/60" : "border-line-strong"
              )}
            />
          ))}
        </div>
      )}
    </>
  )
}

export { Toaster }
