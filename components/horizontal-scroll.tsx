"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export function HorizontalScroll({
  label,
  children,
  className,
  pinned = false,
  pinKey,
  pageScroll = false,
}: {
  label: string
  children: React.ReactNode
  className?: string
  pinned?: boolean
  pinKey?: string | number
  pageScroll?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(pinned)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const viewport = ref.current
    if (!viewport) {
      return
    }
    const update = () => {
      setOverflowing(viewport.scrollWidth > viewport.clientWidth + 1)
      if (stick.current) {
        viewport.scrollLeft = viewport.scrollWidth
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [pinKey])

  useEffect(() => {
    const viewport = ref.current
    if (!viewport) {
      return
    }
    // A sideways component on a vertical wheel would slide the strip and
    // drop the page scroll. Redirect that gesture. Leave a pure vertical
    // wheel to the browser, and leave a horizontal wheel on the strip.
    let verticalGesture = false
    let timer = 0
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return
      }
      const absX = Math.abs(event.deltaX)
      const absY = Math.abs(event.deltaY)
      if (absY > absX) {
        verticalGesture = true
      }
      if (verticalGesture) {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          verticalGesture = false
        }, 160)
      }
      if (!verticalGesture || event.deltaY === 0 || event.deltaX === 0) {
        return
      }
      const scroller = document.scrollingElement
      if (!scroller) {
        return
      }
      scroller.scrollTop += wheelDeltaY(event)
      event.preventDefault()
    }
    viewport.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      window.clearTimeout(timer)
      viewport.removeEventListener("wheel", onWheel)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-label={label}
      tabIndex={overflowing ? 0 : -1}
      className={cn(
        "w-full min-w-0 overflow-x-auto overflow-y-clip overscroll-x-contain pb-3 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1",
        className
      )}
      onScroll={() => {
        const viewport = ref.current
        if (!viewport) {
          return
        }
        stick.current =
          viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 2
      }}
      onKeyDown={(event) => {
        const viewport = event.currentTarget
        const step = pageScroll
          ? viewport.clientWidth
          : event.shiftKey
            ? 160
            : 48
        if (event.key === "ArrowRight") {
          viewport.scrollBy({ left: step })
          event.preventDefault()
        } else if (event.key === "ArrowLeft") {
          viewport.scrollBy({ left: -step })
          event.preventDefault()
        } else if (event.key === "ArrowDown") {
          window.scrollBy({ top: 48 })
          event.preventDefault()
        } else if (event.key === "ArrowUp") {
          window.scrollBy({ top: -48 })
          event.preventDefault()
        } else if (event.key === "Home") {
          viewport.scrollTo({ left: 0 })
          event.preventDefault()
        } else if (event.key === "End") {
          viewport.scrollTo({ left: viewport.scrollWidth })
          event.preventDefault()
        }
      }}
    >
      {children}
    </div>
  )
}

function wheelDeltaY(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * window.innerHeight
  }
  return event.deltaY
}
