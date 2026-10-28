"use client"

import { HorizontalScroll } from "@/components/horizontal-scroll"
import { formatDayLabel } from "@/lib/format"
import { levelAccentClass, levelLabel } from "@/lib/labels"
import { addDays, dayWindow } from "@/lib/time"
import type { DayTimeline, Level } from "@/lib/types"
import { cn } from "@/lib/utils"

const windowDays = 30

type Slice = {
  level: Level
  top: number
  height: number
}

type Point = {
  date: string
  label: string
  aria: string
  slices: Slice[]
  selectable: boolean
}

export function dayHasRecord(day: DayTimeline): boolean {
  return day.segments.length > 0 || day.meals.length > 0 || day.events.length > 0
}

export function StatusRangeChart({
  history,
  timeZone,
  today,
  now,
  selected,
  onSelect,
  onNearStart,
  preserveKey,
}: {
  history: DayTimeline[]
  timeZone: string
  today: string
  now: string
  selected: string
  onSelect: (day: string) => void
  onNearStart?: () => void
  preserveKey?: string | number
}) {
  const series = buildSeries(history, today, timeZone, now)
  const width = `${(series.length / windowDays) * 100}%`

  return (
    <HorizontalScroll
      label="Status history"
      pinned
      pinKey={`${today}:${series.length}`}
      preserveKey={preserveKey}
      onNearStart={onNearStart}
    >
      <div className="flex min-w-full flex-col gap-4 p-1" style={{ width }}>
        <h3 className="sticky left-0 w-fit font-medium">Range</h3>
        <div
          className="flex flex-col gap-2 pr-2"
          role="group"
          aria-label="Status range"
        >
          <div className="flex">
            <div className="flex h-40 w-9 shrink-0 flex-col justify-between text-xs text-muted-foreground tabular-nums">
              <span>12 AM</span>
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>12 AM</span>
            </div>
            <div
              className="grid h-40 min-w-0 flex-1"
              style={{
                gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
              }}
            >
              {series.map((point) => {
                const className = cn(
                  "relative h-40 min-w-0 border-l border-border/60",
                  selected === point.date && "bg-muted"
                )
                if (!point.selectable) {
                  return (
                    <div
                      key={point.date}
                      className={className}
                      aria-label={point.aria}
                    />
                  )
                }
                return (
                  <button
                    key={point.date}
                    type="button"
                    className={cn(
                      className,
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    )}
                    aria-label={point.aria}
                    aria-pressed={selected === point.date}
                    onClick={() => onSelect(point.date)}
                  >
                    {point.slices.map((slice, index) => (
                      <span
                        key={`${slice.level}-${index}`}
                        aria-hidden
                        className={cn(
                          "absolute inset-x-0.5",
                          levelAccentClass[slice.level]
                        )}
                        style={{
                          top: `${slice.top}%`,
                          height: `${Math.max(slice.height, 1)}%`,
                        }}
                      />
                    ))}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex">
            <div className="w-9 shrink-0" aria-hidden />
            <div
              className="grid min-w-0 flex-1"
              style={{
                gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))`,
              }}
            >
              {series.map((point, index) => {
                const show = index === series.length - 1 || index % 5 === 0
                return (
                  <span
                    key={point.date}
                    className="truncate text-center text-xs text-muted-foreground tabular-nums"
                  >
                    {show ? point.label : ""}
                  </span>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </HorizontalScroll>
  )
}

function buildSeries(
  history: DayTimeline[],
  today: string,
  timeZone: string,
  now: string
): Point[] {
  const byDay = new Map(history.map((day) => [day.day, day]))
  const earliest = history[0]?.day ?? today
  let start = addDays(today, -(windowDays - 1))
  if (earliest < start) {
    start = earliest
  }
  const series: Point[] = []
  for (let date = start; date <= today; date = addDays(date, 1)) {
    const item = byDay.get(date) ?? null
    series.push(pointFor(date, item, timeZone, today, now))
  }
  return series
}

function pointFor(
  date: string,
  item: DayTimeline | null,
  timeZone: string,
  today: string,
  now: string
): Point {
  const label = formatDayLabel(date, timeZone, today)
  const segments = item?.segments ?? []
  const detail =
    segments.length > 0
      ? segments
          .map((segment) => `${segment.content}, ${levelLabel[segment.level]}`)
          .join(". ")
      : "No status"
  return {
    date,
    label,
    aria: `${label}, ${detail}`,
    slices: item ? slicesFor(item, timeZone, now) : [],
    selectable: item ? dayHasRecord(item) : false,
  }
}

function slicesFor(item: DayTimeline, timeZone: string, now: string): Slice[] {
  const window = dayWindow(item.day, timeZone)
  const startMs = window.start.getTime()
  const endMs = window.end.getTime()
  const nowMs = Date.parse(now)
  const span = endMs - startMs
  if (!(span > 0)) {
    return []
  }
  return item.segments.flatMap((segment) => {
    const segmentStart = Date.parse(segment.startedAt)
    const open = segment.endedAt == null
    const segmentEnd = open ? nowMs : Date.parse(segment.endedAt ?? "")
    const visibleStart = Math.max(segmentStart, startMs)
    const visibleEnd = Math.min(segmentEnd, endMs)
    if (visibleEnd < visibleStart || (visibleEnd === visibleStart && !open)) {
      return []
    }
    return [
      {
        level: segment.level,
        top: ((visibleStart - startMs) / span) * 100,
        height: ((visibleEnd - visibleStart) / span) * 100,
      },
    ]
  })
}
