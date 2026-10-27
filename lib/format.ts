import { zonedMidnight } from "@/lib/time"

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso))
}

export function formatDayLabel(day: string, timeZone: string, today: string): string {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(zonedMidnight(day, timeZone))
  if (day.slice(0, 4) !== today.slice(0, 4)) {
    return `${label}, ${day.slice(0, 4)}`
  }
  return label
}

export function formatRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatTime(startIso, timeZone)} – ${formatTime(endIso, timeZone)}`
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours <= 0) {
    return `${rest} min`
  }
  if (rest === 0) {
    return `${hours} hr`
  }
  return `${hours} hr ${rest} min`
}
