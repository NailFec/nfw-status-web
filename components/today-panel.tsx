"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatRange, formatTime } from "@/lib/format"
import { levelAccentClass, levelClass, levelLabel, slotLabel } from "@/lib/labels"
import { dayWindow } from "@/lib/time"
import type { CalendarEventView, StatusSegment, TodayPayload } from "@/lib/types"
import { cn } from "@/lib/utils"

const ticks = [0, 6, 12, 18, 24]

export function TodayPanel({ today, now }: { today: TodayPayload; now: string }) {
  return (
    <div className="flex flex-col gap-6">
      <CurrentStatus today={today} />
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Today</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Timeline today={today} now={now} />
        </CardContent>
      </Card>
    </div>
  )
}

function CurrentStatus({ today }: { today: TodayPayload }) {
  const current = today.current
  if (!current) {
    return (
      <Card>
        <CardContent>
          <Empty className="px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>
                <h1 className="text-lg font-medium">No status</h1>
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn("h-8 w-1.5 shrink-0 rounded-full", levelAccentClass[current.level])}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h1
              aria-live="polite"
              className="min-w-0 text-2xl leading-tight font-medium break-words text-balance sm:text-3xl"
            >
              {current.content}
            </h1>
            <Badge variant="secondary">{levelLabel[current.level]}</Badge>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function Timeline({ today, now }: { today: TodayPayload; now: string }) {
  const window = dayWindow(today.day, today.timezone)
  const startMs = window.start.getTime()
  const endMs = window.end.getTime()
  const nowMs = Date.parse(now)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative pt-4">
        {today.meals.map((meal) => {
          const ratio = (Date.parse(meal.eatenAt) - startMs) / (endMs - startMs)
          const left = Math.min(100, Math.max(0, ratio * 100))
          return (
            <span
              key={meal.id}
              role="img"
              aria-label={`${slotLabel[meal.slot]}, ${formatTime(meal.eatenAt, today.timezone)}`}
              className="absolute top-1 size-2.5 -translate-x-1/2 rounded-full bg-foreground"
              style={{ left: `${left}%` }}
            />
          )
        })}
        <div
          role="group"
          aria-label="Today"
          className="relative h-11 overflow-hidden rounded-md bg-muted"
        >
          {today.segments.map((segment) => {
            const clip = clipSegment(segment, startMs, endMs, nowMs)
            if (!clip) {
              return null
            }
            const endIso = segment.endedAt ?? now
            const range = formatRange(segment.startedAt, endIso, today.timezone)
            const label = `${segment.content}, ${range}`
            const narrow = clip.width < 8
            const className = cn(
              "absolute inset-y-0 flex min-w-0 items-center overflow-hidden text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
              levelClass[segment.level],
            )
            const style = {
              left: `${clip.left}%`,
              width: `${clip.width}%`,
              minWidth: "2px",
            }
            if (narrow) {
              return (
                <Tooltip key={segment.id}>
                  <TooltipTrigger
                    aria-label={label}
                    className={cn(className, "border-0 p-0")}
                    style={style}
                  />
                  <TooltipContent>
                    <span className="flex max-w-xs flex-col gap-0.5">
                      <span className="break-words">{segment.content}</span>
                      <span className="tabular-nums">{range}</span>
                    </span>
                  </TooltipContent>
                </Tooltip>
              )
            }
            return (
              <div key={segment.id} className={className} style={style} aria-label={label}>
                <span className="truncate px-1.5">{segment.content}</span>
              </div>
            )
          })}
        </div>
        <CalendarLanes today={today} startMs={startMs} endMs={endMs} />
      </div>
      <div className="relative h-4">
        {ticks.map((hour) => (
          <span
            key={hour}
            aria-hidden
            className="absolute text-xs text-muted-foreground tabular-nums"
            style={{
              left: `${(hour / 24) * 100}%`,
              transform: hour === 0 ? undefined : hour === 24 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {hour}
          </span>
        ))}
      </div>
    </div>
  )
}

function clipSegment(
  segment: StatusSegment,
  startMs: number,
  endMs: number,
  nowMs: number,
): { left: number; width: number } | null {
  const segmentStart = Date.parse(segment.startedAt)
  const open = segment.endedAt == null
  const segmentEnd = open ? nowMs : Date.parse(segment.endedAt ?? "")
  const visibleStart = Math.max(segmentStart, startMs)
  const visibleEnd = Math.min(segmentEnd, endMs)
  if (visibleEnd < visibleStart || (visibleEnd === visibleStart && !open)) {
    return null
  }
  const span = endMs - startMs
  return {
    left: ((visibleStart - startMs) / span) * 100,
    width: ((visibleEnd - visibleStart) / span) * 100,
  }
}

type PlacedEvent = {
  event: CalendarEventView
  lane: number
  left: number
  width: number
  start: number
  end: number
}

function CalendarLanes({
  today,
  startMs,
  endMs,
}: {
  today: TodayPayload
  startMs: number
  endMs: number
}) {
  const placed = placeEvents(today.events, startMs, endMs)
  if (placed.length === 0) {
    return (
      <Empty className="px-6 py-6">
        <EmptyHeader>
          <EmptyTitle>No events</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  const lanes = Math.max(...placed.map((item) => item.lane)) + 1
  return (
    <div className="relative" style={{ height: lanes * 28 }} role="group" aria-label="Calendar">
      {placed.map((item) => {
        const range = item.event.allDay
          ? "All day"
          : formatRange(item.event.start, item.event.end, today.timezone)
        const label = `${item.event.title}, ${range}, ${item.event.calendarName}`
        const narrow = item.width < 8
        return (
          <Tooltip key={item.event.id}>
            <TooltipTrigger
              aria-label={label}
              className="absolute flex min-w-0 items-center overflow-hidden rounded-sm bg-primary px-1 text-xs text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{
                left: `${item.left}%`,
                width: `${item.width}%`,
                top: item.lane * 28 + 2,
                height: 24,
                minWidth: "2px",
              }}
            >
              {narrow ? null : <span className="truncate">{item.event.title}</span>}
            </TooltipTrigger>
            <TooltipContent>
              <span className="flex max-w-xs flex-col gap-0.5">
                <span className="break-words">{item.event.title}</span>
                <span className="tabular-nums">{range}</span>
                <span>{item.event.calendarName}</span>
              </span>
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function placeEvents(events: CalendarEventView[], startMs: number, endMs: number): PlacedEvent[] {
  const span = endMs - startMs
  if (!(span > 0)) {
    return []
  }
  const drafts = events.flatMap((event) => {
    if (event.allDay) {
      return [{ event, left: 0, width: 100, start: startMs, end: endMs }]
    }
    const start = Math.max(Date.parse(event.start), startMs)
    const end = Math.min(Date.parse(event.end), endMs)
    if (!(end > start)) {
      return []
    }
    return [
      {
        event,
        left: ((start - startMs) / span) * 100,
        width: ((end - start) / span) * 100,
        start,
        end,
      },
    ]
  })
  drafts.sort((a, b) => a.start - b.start || b.end - a.end)
  const laneEnds: number[] = []
  return drafts.map((item) => {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    return { ...item, lane }
  })
}
