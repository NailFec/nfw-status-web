import { eventsBetween, refreshIfStale } from "@/lib/calendar"
import { getDb } from "@/lib/db"
import { mealsBetween } from "@/lib/meals"
import { sleepOn } from "@/lib/sleep"
import { currentStatus, segmentsOverlapping } from "@/lib/status"
import {
  addDays,
  dayWindow,
  formatIso,
  nowIso,
  statusTimeZone,
  todayKey,
} from "@/lib/time"
import type {
  CurrentStatus,
  DayTimeline,
  HistoryPage,
  Meal,
  StatusSegment,
  TodayPayload,
} from "@/lib/types"

export const historyPageDays = 100

function dayList(start: string, end: string): string[] {
  const days: string[] = []
  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day)
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

function hasRecordsBefore(startDay: string, startIso: string): boolean {
  const db = getDb()
  const status = db
    .prepare("SELECT 1 AS found FROM status_segments WHERE started_at < ? LIMIT 1")
    .get(startIso)
  const meal = db
    .prepare("SELECT 1 AS found FROM meals WHERE day < ? LIMIT 1")
    .get(startDay)
  const event = db
    .prepare("SELECT 1 AS found FROM calendar_events WHERE day < ? LIMIT 1")
    .get(startDay)
  return status != null || meal != null || event != null
}

export function loadHistory(end: string, limit: number): HistoryPage {
  const timeZone = statusTimeZone()
  const now = nowIso(timeZone)
  const start = addDays(end, -(limit - 1))
  const days = dayList(start, end)
  const range = {
    start: dayWindow(start, timeZone).start,
    end: dayWindow(end, timeZone).end,
  }
  const startIso = formatIso(range.start, timeZone)
  const segments = segmentsOverlapping(startIso, formatIso(range.end, timeZone), now)
  const meals = mealsBetween(start, end)
  const events = eventsBetween(start, end)
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
  return {
    timezone: timeZone,
    now,
    start,
    end,
    days: history,
    hasMore: hasRecordsBefore(start, startIso),
    current: toCurrent(currentStatus(now)),
  }
}

function toCurrent(current: StatusSegment | null): CurrentStatus | null {
  if (!current) {
    return null
  }
  return {
    id: current.id,
    level: current.level,
    content: current.content,
    startedAt: current.startedAt,
  }
}

export async function loadToday(): Promise<TodayPayload> {
  await refreshIfStale()
  const day = todayKey()
  const page = loadHistory(day, historyPageDays)
  const currentDay = page.days[page.days.length - 1]
  return {
    timezone: page.timezone,
    now: page.now,
    day,
    current: page.current,
    segments: currentDay?.segments ?? [],
    meals: currentDay?.meals ?? [],
    events: currentDay?.events ?? [],
    sleep: sleepOn(day),
    history: page.days,
    historyHasMore: page.hasMore,
  }
}
