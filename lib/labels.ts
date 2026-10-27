import type { Level, SleepStageName, Slot } from "@/lib/types"

export const levelLabel: Record<Level, string> = {
  very_free: "Very free and boring",
  free: "Free",
  doing: "Doing things",
  busy: "Busy",
  afk: "AFK",
}

export const slotLabel: Record<Slot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
}

export const stageLabel: Record<SleepStageName, string> = {
  awake: "Awake",
  light: "Light",
  deep: "Deep",
  rem: "REM",
  unknown: "Unknown",
}

export const levelClass: Record<Level, string> = {
  very_free: "bg-status-very-free text-status-very-free-foreground",
  free: "bg-status-free text-status-free-foreground",
  doing: "bg-status-doing text-status-doing-foreground",
  busy: "bg-status-busy text-status-busy-foreground",
  afk: "bg-status-afk text-status-afk-foreground",
}

export const levelAccentClass: Record<Level, string> = {
  very_free: "bg-status-very-free",
  free: "bg-status-free",
  doing: "bg-status-doing",
  busy: "bg-status-busy",
  afk: "bg-status-afk",
}

export const stageClass: Record<SleepStageName, string> = {
  awake: "bg-sleep-awake",
  light: "bg-sleep-light",
  deep: "bg-sleep-deep",
  rem: "bg-sleep-rem",
  unknown: "bg-sleep-unknown",
}
