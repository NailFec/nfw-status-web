"use client"

import { useEffect, useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { SleepCharts } from "@/components/sleep-charts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { formatDayLabel, formatDuration, formatTime } from "@/lib/format"
import { stageClass, stageLabel } from "@/lib/labels"
import type { SleepDay, SleepStageName } from "@/lib/types"
import { cn } from "@/lib/utils"

const stageOrder: SleepStageName[] = [
  "awake",
  "rem",
  "light",
  "deep",
  "unknown",
]

export function SleepPanel({
  days,
  timeZone,
  today,
}: {
  days: SleepDay[]
  timeZone: string
  today: string
}) {
  const [selected, setSelected] = useState(days[0]?.date ?? "")

  useEffect(() => {
    setSelected((current) => {
      if (current && days.some((day) => day.date === current)) {
        return current
      }
      return days[0]?.date ?? ""
    })
  }, [days])

  const index = Math.max(
    0,
    days.findIndex((day) => day.date === selected)
  )
  const day = days[index]

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Sleep</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!day ? (
          <Empty className="px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>No sleep</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <SleepDayView
            day={day}
            timeZone={timeZone}
            today={today}
            canOlder={index < days.length - 1}
            canNewer={index > 0}
            onOlder={() => {
              const next = days[index + 1]
              if (next) {
                setSelected(next.date)
              }
            }}
            onNewer={() => {
              const next = days[index - 1]
              if (next) {
                setSelected(next.date)
              }
            }}
          />
        )}
        <SleepCharts
          days={days}
          timeZone={timeZone}
          today={today}
          selected={selected}
          onSelect={setSelected}
        />
      </CardContent>
    </Card>
  )
}

function SleepDayView({
  day,
  timeZone,
  today,
  canOlder,
  canNewer,
  onOlder,
  onNewer,
}: {
  day: SleepDay
  timeZone: string
  today: string
  canOlder: boolean
  canNewer: boolean
  onOlder: () => void
  onNewer: () => void
}) {
  const dateLabel = formatDayLabel(day.date, timeZone, today)
  const hasHealth =
    day.bedtime !== null ||
    day.wakeTime !== null ||
    day.durationMinutes !== null ||
    day.stages.length > 0
  const present = stageOrder.filter((stage) =>
    day.stages.some((item) => item.stage === stage)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={onOlder} disabled={!canOlder}>
          <ChevronLeftIcon data-icon="inline-start" />
          Older
        </Button>
        <p className="text-sm font-medium tabular-nums">{dateLabel}</p>
        <Button variant="outline" onClick={onNewer} disabled={!canNewer}>
          Newer
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
      {hasHealth ? (
        <dl className="grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Bedtime</dt>
            <dd className="tabular-nums">
              {day.bedtime ? formatTime(day.bedtime, timeZone) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Wake</dt>
            <dd className="tabular-nums">
              {day.wakeTime ? formatTime(day.wakeTime, timeZone) : "—"}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Duration</dt>
            <dd className="tabular-nums">
              {day.durationMinutes === null
                ? "—"
                : formatDuration(day.durationMinutes)}
            </dd>
          </div>
        </dl>
      ) : null}
      {day.stages.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div
            className="relative h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={stageSummary(day, timeZone)}
          >
            {stageSlices(day).map((slice, index) => (
              <span
                key={`${slice.stage}-${index}`}
                className={cn("absolute inset-y-0", stageClass[slice.stage])}
                style={{ left: `${slice.left}%`, width: `${slice.width}%` }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-3">
            {present.map((stage) => (
              <li key={stage} className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full", stageClass[stage])}
                />
                {stageLabel[stage]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function stageSummary(day: SleepDay, timeZone: string): string {
  return day.stages
    .map(
      (stage) =>
        `${stageLabel[stage.stage]}, ${formatTime(stage.start, timeZone)} – ${formatTime(stage.end, timeZone)}`
    )
    .join(". ")
}

function stageSlices(
  day: SleepDay
): { stage: SleepStageName; left: number; width: number }[] {
  const starts = day.stages.map((stage) => Date.parse(stage.start))
  const ends = day.stages.map((stage) => Date.parse(stage.end))
  const origin = day.bedtime ? Date.parse(day.bedtime) : Math.min(...starts)
  const finish = day.wakeTime ? Date.parse(day.wakeTime) : Math.max(...ends)
  const span = finish - origin
  if (!(span > 0)) {
    return []
  }
  return day.stages.flatMap((stage) => {
    const visibleStart = Math.max(Date.parse(stage.start), origin)
    const visibleEnd = Math.min(Date.parse(stage.end), finish)
    if (!(visibleEnd > visibleStart)) {
      return []
    }
    return [
      {
        stage: stage.stage,
        left: ((visibleStart - origin) / span) * 100,
        width: ((visibleEnd - visibleStart) / span) * 100,
      },
    ]
  })
}
