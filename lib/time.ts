export function statusTimeZone(): string {
  const configured = process.env.STATUS_TIMEZONE?.trim()
  return configured || "Asia/Shanghai"
}

type ZonedParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
  const map: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value
    }
  }
  let hour = map.hour ?? "00"
  if (hour === "24") {
    hour = "00"
  }
  return {
    year: map.year ?? "0000",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour,
    minute: map.minute ?? "00",
    second: map.second ?? "00",
  }
}

export function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone)
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const truncated = Math.floor(date.getTime() / 1000) * 1000
  return wall - truncated
}

export function formatIso(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone)
  const offset = offsetMs(date, timeZone)
  const sign = offset >= 0 ? "+" : "-"
  const absolute = Math.abs(offset)
  const hours = String(Math.floor(absolute / 3_600_000)).padStart(2, "0")
  const minutes = String(Math.floor((absolute % 3_600_000) / 60_000)).padStart(2, "0")
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${sign}${hours}:${minutes}`
}

export function nowIso(timeZone = statusTimeZone()): string {
  return formatIso(new Date(), timeZone)
}

export function dayKey(date: Date, timeZone: string): string {
  const parts = zonedParts(date, timeZone)
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function todayKey(timeZone = statusTimeZone()): string {
  return dayKey(new Date(), timeZone)
}

export function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return false
  }
  const [year, month, dayOfMonth] = day.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, dayOfMonth))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === dayOfMonth
  )
}

export function addDays(day: string, amount: number): string {
  const [year, month, dayOfMonth] = day.split("-").map(Number)
  const utc = new Date(Date.UTC(year, month - 1, dayOfMonth + amount))
  const nextYear = utc.getUTCFullYear()
  const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0")
  const nextDay = String(utc.getUTCDate()).padStart(2, "0")
  return `${nextYear}-${nextMonth}-${nextDay}`
}

export function zonedMidnight(day: string, timeZone: string): Date {
  const [year, month, dayOfMonth] = day.split("-").map(Number)
  const utcGuess = Date.UTC(year, month - 1, dayOfMonth, 0, 0, 0)
  let offset = offsetMs(new Date(utcGuess), timeZone)
  let instant = utcGuess - offset
  offset = offsetMs(new Date(instant), timeZone)
  instant = utcGuess - offset
  return new Date(instant)
}

export function dayWindow(day: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedMidnight(day, timeZone),
    end: zonedMidnight(addDays(day, 1), timeZone),
  }
}

export function parseInstant(value: string): Date | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date
}
