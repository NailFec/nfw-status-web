"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { dayHasRecord, StatusRangeChart } from "@/components/status-range-chart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatDayLabel, formatRange, formatTime } from "@/lib/format"
import {
  levelAccentClass,
  levelClass,
  levelLabel,
  slotLabel,
} from "@/lib/labels"
import { dayWindow } from "@/lib/time"
import type {
  CalendarEventView,
  DayTimeline,
  StatusSegment,
  TodayPayload,
} from "@/lib/types"
import { cn } from "@/lib/utils"

const ticks = [0, 6, 12, 18, 24]

export function TodayPanel({
  today,
  now,
}: {
  today: TodayPayload
  now: string
}) {
  const recorded = useMemo(
    () => today.history.filter(dayHasRecord).reverse(),
    [today.history]
  )
  const [selected, setSelected] = useState(recorded[0]?.day ?? "")

  useEffect(() => {
    setSelected((current) => {
      if (current && recorded.some((day) => day.day === current)) {
        return current
      }
      return recorded[0]?.day ?? ""
    })
  }, [recorded])

  const index = Math.max(
    0,
    recorded.findIndex((day) => day.day === selected)
  )
  const item = recorded[index]

  return (
    <TooltipProvider delay={0}>
      <div className="flex min-w-0 flex-col gap-6">
        <CurrentStatus today={today} />
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2>Status</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!item ? (
              <Empty className="px-6 py-8">
                <EmptyHeader>
                  <EmptyTitle>No status</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = recorded[index + 1]
                      if (next) {
                        setSelected(next.day)
                      }
                    }}
                    disabled={index >= recorded.length - 1}
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    Older
                  </Button>
                  <p className="text-sm font-medium tabular-nums">
                    {formatDayLabel(item.day, today.timezone, today.day)}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const next = recorded[index - 1]
                      if (next) {
                        setSelected(next.day)
                      }
                    }}
                    disabled={index <= 0}
                  >
                    Newer
                    <ChevronRightIcon data-icon="inline-end" />
                  </Button>
                </div>
                <Timeline
                  item={item}
                  timeZone={today.timezone}
                  now={now}
                  label={formatDayLabel(item.day, today.timezone, today.day)}
                />
              </div>
            )}
            <StatusRangeChart
              history={today.history}
              timeZone={today.timezone}
              today={today.day}
              now={now}
              selected={selected}
              onSelect={setSelected}
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
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
            className={cn(
              "h-8 w-1.5 shrink-0 rounded-full",
              levelAccentClass[current.level]
            )}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h1
              aria-live="polite"
              className="min-w-0 text-2xl leading-tight font-medium text-balance break-words sm:text-3xl"
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

function markerShift(left: number): string {
  if (left < 12) {
    return "translate-x-0"
  }
  if (left > 88) {
    return "-translate-x-full"
  }
  return "-translate-x-1/2"
}

function Timeline({
  item,
  timeZone,
  now,
  label,
}: {
  item: DayTimeline
  timeZone: string
  now: string
  label: string
}) {
  const window = dayWindow(item.day, timeZone)
  const startMs = window.start.getTime()
  const endMs = window.end.getTime()
  const nowMs = Date.parse(now)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div className="relative h-10">
          {item.meals.map((meal) => {
            const ratio =
              (Date.parse(meal.eatenAt) - startMs) / (endMs - startMs)
            const left = Math.min(100, Math.max(0, ratio * 100))
            const name = slotLabel[meal.slot]
            const time = formatTime(meal.eatenAt, timeZone)
            return (
              <Tooltip key={meal.id}>
                <TooltipTrigger
                  type="button"
                  delay={0}
                  aria-label={`${name}, ${time}`}
                  className={cn(
                    "absolute bottom-0 flex flex-col items-center gap-1 border-0 bg-transparent p-0 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    markerShift(left)
                  )}
                  style={{ left: `${left}%` }}
                >
                  <span className="leading-none whitespace-nowrap">{name}</span>
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full bg-foreground"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <span className="flex max-w-xs flex-col gap-0.5">
                    <span>{name}</span>
                    <span className="tabular-nums">{time}</span>
                  </span>
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div
          role="group"
          aria-label={label}
          className="relative h-11 overflow-hidden rounded-md bg-muted"
        >
          {item.segments.map((segment) => {
            const clip = clipSegment(segment, startMs, endMs, nowMs)
            if (!clip) {
              return null
            }
            return (
              <StatusBlock
                key={segment.id}
                segment={segment}
                clip={clip}
                now={now}
                timeZone={timeZone}
              />
            )
          })}
        </div>
        <CalendarLanes
          events={item.events}
          timeZone={timeZone}
          startMs={startMs}
          endMs={endMs}
        />
      </div>
      <div className="relative h-4">
        {ticks.map((hour) => (
          <span
            key={hour}
            aria-hidden
            className="absolute text-xs text-muted-foreground tabular-nums"
            style={{
              left: `${(hour / 24) * 100}%`,
              transform:
                hour === 0
                  ? undefined
                  : hour === 24
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {hour}
          </span>
        ))}
      </div>
    </div>
  )
}

function StatusBlock({
  segment,
  clip,
  now,
  timeZone,
}: {
  segment: StatusSegment
  clip: { left: number; width: number }
  now: string
  timeZone: string
}) {
  const endIso = segment.endedAt ?? now
  const range = formatRange(segment.startedAt, endIso, timeZone)
  const level = levelLabel[segment.level]
  const description = `${segment.content}, ${level}, ${range}`
  const narrow = clip.width < 8
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        delay={0}
        aria-label={description}
        className={cn(
          "absolute inset-y-0 flex min-w-0 items-center justify-start overflow-hidden border-0 p-0 text-left text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
          levelClass[segment.level]
        )}
        style={{
          left: `${clip.left}%`,
          width: `${clip.width}%`,
          minWidth: "2px",
        }}
      >
        {narrow ? null : (
          <span className="truncate px-1.5">{segment.content}</span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex max-w-xs flex-col gap-0.5">
          <span className="break-words">{segment.content}</span>
          <span>{level}</span>
          <span className="tabular-nums">{range}</span>
        </span>
      </TooltipContent>
    </Tooltip>
  )
}

function clipSegment(
  segment: StatusSegment,
  startMs: number,
  endMs: number,
  nowMs: number
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
  events,
  timeZone,
  startMs,
  endMs,
}: {
  events: CalendarEventView[]
  timeZone: string
  startMs: number
  endMs: number
}) {
  const placed = placeEvents(events, startMs, endMs)
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
    <div
      className="relative"
      style={{ height: lanes * 28 }}
      role="group"
      aria-label="Calendar"
    >
      {placed.map((item) => {
        const range = item.event.allDay
          ? "All day"
          : formatRange(item.event.start, item.event.end, timeZone)
        const label = `${item.event.title}, ${range}, ${item.event.calendarName}`
        const narrow = item.width < 8
        return (
          <Tooltip key={item.event.id}>
            <TooltipTrigger
              type="button"
              delay={0}
              aria-label={label}
              className="absolute flex min-w-0 items-center overflow-hidden rounded-sm bg-primary px-1 text-left text-xs text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              style={{
                left: `${item.left}%`,
                width: `${item.width}%`,
                top: item.lane * 28 + 2,
                height: 24,
                minWidth: "2px",
              }}
            >
              {narrow ? null : (
                <span className="truncate">{item.event.title}</span>
              )}
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

function placeEvents(
  events: CalendarEventView[],
  startMs: number,
  endMs: number
): PlacedEvent[] {
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
