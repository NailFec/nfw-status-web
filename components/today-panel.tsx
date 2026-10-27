"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatRange, formatTime } from "@/lib/format"
import { levelAccentClass, levelClass, levelLabel, slotLabel } from "@/lib/labels"
import { dayWindow } from "@/lib/time"
import type { StatusSegment, TodayPayload } from "@/lib/types"
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
          <Separator />
          <h3 className="font-medium">Calendar</h3>
          <CalendarList today={today} />
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
        <div className="flex items-stretch gap-3">
          <span
            aria-hidden
            className={cn("w-1.5 shrink-0 rounded-full", levelAccentClass[current.level])}
          />
          <h1
            aria-live="polite"
            className="min-w-0 flex-1 text-2xl leading-tight font-medium break-words text-balance sm:text-3xl"
          >
            <span className="sr-only">{levelLabel[current.level]}, </span>
            {current.content}
          </h1>
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
              "absolute inset-y-0 flex min-w-0 items-center overflow-hidden text-xs font-medium focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
              levelClass[segment.level],
              narrow && "min-w-6",
            )
            const style = { left: `${clip.left}%`, width: `${clip.width}%` }
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
  const segmentEnd = segment.endedAt ? Date.parse(segment.endedAt) : nowMs
  const visibleStart = Math.max(segmentStart, startMs)
  const visibleEnd = Math.min(segmentEnd, endMs)
  if (!(visibleEnd > visibleStart)) {
    return null
  }
  const span = endMs - startMs
  return {
    left: ((visibleStart - startMs) / span) * 100,
    width: ((visibleEnd - visibleStart) / span) * 100,
  }
}

function CalendarList({ today }: { today: TodayPayload }) {
  if (today.events.length === 0) {
    return (
      <Empty className="px-6 py-8">
        <EmptyHeader>
          <EmptyTitle>No events</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }
  const allDay = today.events.filter((event) => event.allDay)
  const timed = today.events.filter((event) => !event.allDay)
  return (
    <div className="flex flex-col gap-3">
      {allDay.length > 0 ? <EventRows events={allDay} timeZone={today.timezone} /> : null}
      {allDay.length > 0 && timed.length > 0 ? <Separator /> : null}
      {timed.length > 0 ? <EventRows events={timed} timeZone={today.timezone} /> : null}
    </div>
  )
}

function EventRows({
  events,
  timeZone,
}: {
  events: TodayPayload["events"]
  timeZone: string
}) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((event) => (
        <li key={event.id} className="flex min-w-0 items-center gap-3">
          <span className="w-24 shrink-0 text-muted-foreground tabular-nums">
            {event.allDay ? "All day" : formatTime(event.start, timeZone)}
          </span>
          <span className="min-w-0 flex-1 truncate">{event.title}</span>
          <Badge variant="secondary" className="max-w-36 truncate">
            {event.calendarName}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
