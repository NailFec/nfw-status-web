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

const patchSchema = z
  .object({
    bedtime: z.string().nullable().optional(),
    wakeTime: z.string().nullable().optional(),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    stages: z.array(stageSchema).optional(),
  })
  .strict()

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

export function sleepOn(date: string): SleepDay | null {
  const row = getDb().prepare("SELECT * FROM sleep_days WHERE date = ?").get(date) as
    | SleepRow
    | undefined
  if (!row) {
    return null
  }
  return {
    date,
    bedtime: row.bedtime,
    wakeTime: row.wake_time,
    durationMinutes: row.duration_minutes,
    stages: parseStages(row.stages_json),
  }
}

export function listSleep(before: string, limit: number): SleepDay[] {
  const rows = getDb()
    .prepare(
      `SELECT date FROM sleep_days
       WHERE date <= ?
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(before, limit) as { date: string }[]
  return rows.flatMap((row) => {
    const day = sleepOn(row.date)
    return day ? [day] : []
  })
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

export function patchSleep(date: string, body: unknown): SleepDay {
  if (!isRealDay(date)) {
    invalid()
  }
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    invalid()
  }
  const db = getDb()
  const current = db.prepare("SELECT * FROM sleep_days WHERE date = ?").get(date) as
    | SleepRow
    | undefined
  if (!current) {
    throw new ApiError("not_found", 404)
  }
  const bedtime =
    parsed.data.bedtime === undefined
      ? current.bedtime
      : parsed.data.bedtime === null
        ? null
        : normalizeInstant(parsed.data.bedtime)
  const wakeTime =
    parsed.data.wakeTime === undefined
      ? current.wake_time
      : parsed.data.wakeTime === null
        ? null
        : normalizeInstant(parsed.data.wakeTime)
  const duration =
    parsed.data.durationMinutes === undefined
      ? current.duration_minutes
      : parsed.data.durationMinutes
  const stages =
    parsed.data.stages === undefined
      ? current.stages_json
      : JSON.stringify(normalizeStages(parsed.data.stages))
  db.prepare(
    `UPDATE sleep_days
     SET bedtime = ?, wake_time = ?, duration_minutes = ?, stages_json = ?, updated_at = ?
     WHERE date = ?`,
  ).run(bedtime, wakeTime, duration, stages, nowIso(), date)
  publish("sleep")
  const day = sleepOn(date)
  if (!day) {
    throw new ApiError("not_found", 404)
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
