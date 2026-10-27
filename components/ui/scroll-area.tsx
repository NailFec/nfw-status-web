"use client"

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "cn"

function ScrollArea({
  className,
  children,
  label,
  ...props
}: ScrollAreaPrimitive.Root.Props & { label?: string }) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        aria-label={label}
        tabIndex={0}
        className="size-full rounded-[inherit] overscroll-contain transition-[color,box-shadow] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1"
        onKeyDown={(event) => {
          const viewport = event.currentTarget
          const step = event.shiftKey ? 160 : 48
          if (event.key === "ArrowRight") {
            viewport.scrollBy({ left: step })
            event.preventDefault()
          } else if (event.key === "ArrowLeft") {
            viewport.scrollBy({ left: -step })
            event.preventDefault()
          } else if (event.key === "ArrowDown") {
            viewport.scrollBy({ top: step })
            event.preventDefault()
          } else if (event.key === "ArrowUp") {
            viewport.scrollBy({ top: -step })
            event.preventDefault()
          } else if (event.key === "Home") {
            viewport.scrollTo({ left: 0, top: 0 })
            event.preventDefault()
          } else if (event.key === "End") {
            viewport.scrollTo({ left: viewport.scrollWidth, top: viewport.scrollHeight })
            event.preventDefault()
          }
        }}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
