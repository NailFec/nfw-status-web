import { eventsOnDay, refreshIfStale } from "@/lib/calendar"
import { mealsOnDay } from "@/lib/meals"
import { sleepOn } from "@/lib/sleep"
import { currentStatus, segmentsOverlapping } from "@/lib/status"
import { dayWindow, formatIso, nowIso, statusTimeZone, todayKey } from "@/lib/time"
import type { CurrentStatus, TodayPayload } from "@/lib/types"

export async function loadToday(): Promise<TodayPayload> {
  await refreshIfStale()
  const timeZone = statusTimeZone()
  const now = nowIso(timeZone)
  const day = todayKey(timeZone)
  const window = dayWindow(day, timeZone)
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
    segments: segmentsOverlapping(
      formatIso(window.start, timeZone),
      formatIso(window.end, timeZone),
      now,
    ),
    meals: mealsOnDay(day),
    events: eventsOnDay(day),
    sleep: sleepOn(day),
  }
}
