import { eventsBetween, refreshIfStale } from "@/lib/calendar"
import { getDb } from "@/lib/db"
import { mealsBetween } from "@/lib/meals"
import { sleepOn } from "@/lib/sleep"
import { currentStatus, segmentsOverlapping } from "@/lib/status"
import {
  addDays,
  dayWindow,
  formatIso,
  isRealDay,
  nowIso,
  statusTimeZone,
  todayKey,
} from "@/lib/time"
import type {
  CurrentStatus,
  DayTimeline,
  Meal,
  StatusSegment,
  TodayPayload,
} from "@/lib/types"

const historyDays = 30
const maxHistoryDays = 90

function earliestStoredDay(): string | null {
  const db = getDb()
  const status = db
    .prepare("SELECT MIN(started_at) AS value FROM status_segments")
    .get() as {
    value: string | null
  }
  const meal = db.prepare("SELECT MIN(day) AS value FROM meals").get() as {
    value: string | null
  }
  const event = db
    .prepare("SELECT MIN(day) AS value FROM calendar_events")
    .get() as {
    value: string | null
  }
  const candidates = [
    status.value?.slice(0, 10),
    meal.value,
    event.value,
  ].filter((day): day is string => typeof day === "string" && isRealDay(day))
  if (candidates.length === 0) {
    return null
  }
  return candidates.reduce((soonest, day) => (day < soonest ? day : soonest))
}

function historyStart(today: string): string {
  const standard = addDays(today, -(historyDays - 1))
  const cap = addDays(today, -(maxHistoryDays - 1))
  const earliest = earliestStoredDay()
  if (!earliest || earliest >= standard) {
    return standard
  }
  return earliest < cap ? cap : earliest
}

function dayList(start: string, end: string): string[] {
  const days: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day)
    if (days.length > maxHistoryDays) {
      break
    }
  }
  return days
}

function segmentsOnDay(
  segments: StatusSegment[],
  day: string,
  timeZone: string
): StatusSegment[] {
  const window = dayWindow(day, timeZone)
  const start = window.start.getTime()
  const end = window.end.getTime()
  return segments.filter((segment) => {
    const segmentStart = Date.parse(segment.startedAt)
    const segmentEnd = segment.endedAt
      ? Date.parse(segment.endedAt)
      : Number.POSITIVE_INFINITY
    return segmentStart < end && start < segmentEnd
  })
}

export async function loadToday(): Promise<TodayPayload> {
  await refreshIfStale()
  const timeZone = statusTimeZone()
  const now = nowIso(timeZone)
  const day = todayKey(timeZone)
  const start = historyStart(day)
  const days = dayList(start, day)
  const range = {
    start: dayWindow(start, timeZone).start,
    end: dayWindow(day, timeZone).end,
  }
  const segments = segmentsOverlapping(
    formatIso(range.start, timeZone),
    formatIso(range.end, timeZone),
    now,
  )
  const meals = mealsBetween(start, day)
  const events = eventsBetween(start, day)
  const mealsByDay = new Map<string, Meal[]>()
  for (const meal of meals) {
    const list = mealsByDay.get(meal.day) ?? []
    list.push(meal)
    mealsByDay.set(meal.day, list)
  }
  const history: DayTimeline[] = days.map((date) => ({
    day: date,
    segments: segmentsOnDay(segments, date, timeZone),
    meals: mealsByDay.get(date) ?? [],
    events: events.get(date) ?? [],
  }))
  const currentDay = history[history.length - 1]
  const current = currentStatus(now)
  const payloadCurrent: CurrentStatus | null = current
    ? {
        id: current.id,
        level: current.level,
        content: current.content,
        startedAt: current.startedAt,
      }
    : null
  return {
    timezone: timeZone,
    now,
    day,
    current: payloadCurrent,
    segments: currentDay?.segments ?? [],
    meals: currentDay?.meals ?? [],
    events: currentDay?.events ?? [],
    sleep: sleepOn(day),
    history,
  }
}
