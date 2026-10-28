import { z } from "zod"

import { getDb } from "@/lib/db"
import { ApiError, invalid } from "@/lib/errors"
import { publish } from "@/lib/live"
import { formatIso, isRealDay, nowIso, parseInstant, statusTimeZone } from "@/lib/time"
import { SLEEP_STAGES, type SleepDay, type SleepStage } from "@/lib/types"

type SleepRow = {
  date: string
  bedtime: string | null
  wake_time: string | null
  duration_minutes: number | null
  stages_json: string | null
  updated_at: string
}

const stageSchema = z.object({
  stage: z.enum(SLEEP_STAGES),
  start: z.string(),
  end: z.string(),
})

const postSchema = z.object({
  date: z.string(),
  bedtime: z.string(),
  wakeTime: z.string(),
  durationMinutes: z.number().int().nonnegative(),
  stages: z.array(stageSchema),
})

function normalizeInstant(value: string): string {
  const timeZone = statusTimeZone()
  const date = parseInstant(value)
  if (!date) {
    invalid()
  }
  return formatIso(date, timeZone)
}

function normalizeStages(stages: z.infer<typeof stageSchema>[]): SleepStage[] {
  return stages.map((stage) => {
    const start = normalizeInstant(stage.start)
    const end = normalizeInstant(stage.end)
    if (Date.parse(end) <= Date.parse(start)) {
      invalid()
    }
    return { stage: stage.stage, start, end }
  })
}

function parseStages(json: string | null): SleepStage[] {
  if (!json) {
    return []
  }
  try {
    const value = JSON.parse(json) as unknown
    const parsed = z.array(stageSchema).safeParse(value)
    if (!parsed.success) {
      return []
    }
    return parsed.data
  } catch {
    return []
  }
}

function toSleepDay(row: SleepRow): SleepDay {
  return {
    date: row.date,
    bedtime: row.bedtime,
    wakeTime: row.wake_time,
    durationMinutes: row.duration_minutes,
    stages: parseStages(row.stages_json),
  }
}

export function sleepOn(date: string): SleepDay | null {
  const row = getDb().prepare("SELECT * FROM sleep_days WHERE date = ?").get(date) as
    | SleepRow
    | undefined
  if (!row) {
    return null
  }
  return toSleepDay(row)
}

export function listSleep(before: string, limit?: number): SleepDay[] {
  const limited = limit != null
  const rows = getDb()
    .prepare(
      `SELECT date, bedtime, wake_time, duration_minutes, stages_json, updated_at
       FROM sleep_days
       WHERE date <= ?
       ORDER BY date DESC
       ${limited ? "LIMIT ?" : ""}`,
    )
    .all(...(limited ? [before, limit] : [before])) as SleepRow[]
  return rows.map(toSleepDay)
}

export function sleepDates(): string[] {
  const rows = getDb()
    .prepare("SELECT date FROM sleep_days ORDER BY date ASC")
    .all() as { date: string }[]
  return rows.map((row) => row.date)
}

export function saveSleep(body: unknown): SleepDay {
  const parsed = postSchema.safeParse(body)
  if (!parsed.success || !isRealDay(parsed.data.date)) {
    invalid()
  }
  const stages = normalizeStages(parsed.data.stages)
  const bedtime = normalizeInstant(parsed.data.bedtime)
  const wakeTime = normalizeInstant(parsed.data.wakeTime)
  const timeZone = statusTimeZone()
  getDb()
    .prepare(
      `INSERT INTO sleep_days (date, bedtime, wake_time, duration_minutes, stages_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         bedtime = excluded.bedtime,
         wake_time = excluded.wake_time,
         duration_minutes = excluded.duration_minutes,
         stages_json = excluded.stages_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      parsed.data.date,
      bedtime,
      wakeTime,
      parsed.data.durationMinutes,
      JSON.stringify(stages),
      nowIso(timeZone),
    )
  publish("sleep")
  const day = sleepOn(parsed.data.date)
  if (!day) {
    throw new ApiError("invalid", 400)
  }
  return day
}

export function deleteSleep(date: string): void {
  if (!isRealDay(date)) {
    invalid()
  }
  const result = getDb().prepare("DELETE FROM sleep_days WHERE date = ?").run(date)
  if (result.changes === 0) {
    throw new ApiError("not_found", 404)
  }
  publish("sleep")
}
