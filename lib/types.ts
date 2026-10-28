export const LEVELS = ["very_free", "free", "doing", "busy", "afk"] as const

export type Level = (typeof LEVELS)[number]

export const SLOTS = ["breakfast", "lunch", "dinner"] as const

export type Slot = (typeof SLOTS)[number]

export const SLEEP_STAGES = [
  "awake",
  "light",
  "deep",
  "rem",
  "unknown",
] as const

export type SleepStageName = (typeof SLEEP_STAGES)[number]

export type LiveKind = "status" | "meal" | "sleep" | "calendar"

export type StatusSegment = {
  id: string
  level: Level
  content: string
  startedAt: string
  endedAt: string | null
}

export type CurrentStatus = {
  id: string
  level: Level
  content: string
  startedAt: string
}

export type MealPhoto = {
  id: string
  url: string
}

export type Meal = {
  id: string
  day: string
  slot: Slot
  eatenAt: string
  photos: MealPhoto[]
}

export type CalendarEventView = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  calendarName: string
}

export type SleepStage = {
  stage: SleepStageName
  start: string
  end: string
}

export type SleepDay = {
  date: string
  bedtime: string | null
  wakeTime: string | null
  durationMinutes: number | null
  stages: SleepStage[]
}

export type DayTimeline = {
  day: string
  segments: StatusSegment[]
  meals: Meal[]
  events: CalendarEventView[]
}

export type TodayPayload = {
  timezone: string
  now: string
  day: string
  current: CurrentStatus | null
  segments: StatusSegment[]
  meals: Meal[]
  events: CalendarEventView[]
  sleep: SleepDay | null
  history: DayTimeline[]
}

export type Phrase = {
  id: string
  text: string
  lastUsedAt: string
}

export type CalendarSubscription = {
  id: string
  name: string
  url: string
  lastOkAt: string | null
  lastError: string | null
}

export function isLevel(value: string): value is Level {
  return (LEVELS as readonly string[]).includes(value)
}

export function isSlot(value: string): value is Slot {
  return (SLOTS as readonly string[]).includes(value)
}
