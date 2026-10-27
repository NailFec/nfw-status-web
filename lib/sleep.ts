import { randomUUID } from "node:crypto"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { ApiError, invalid } from "@/lib/errors"
import { deleteUpload, readImage, saveUpload } from "@/lib/files"
import { mediaUrl } from "@/lib/http"
import { publish } from "@/lib/live"
import { formatIso, isRealDay, nowIso, parseInstant, statusTimeZone } from "@/lib/time"
import {
  SLEEP_STAGES,
  type SleepDay,
  type SleepScreenshot,
  type SleepStage,
} from "@/lib/types"

type SleepRow = {
  date: string
  bedtime: string | null
  wake_time: string | null
  duration_minutes: number | null
  stages_json: string | null
  updated_at: string
}

type ShotRow = {
  id: string
  date: string
  created_at: string
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

function screenshotsFor(date: string): SleepScreenshot[] {
  const rows = getDb()
    .prepare(
      "SELECT id, date, created_at FROM sleep_screenshots WHERE date = ? ORDER BY created_at ASC, id ASC",
    )
    .all(date) as ShotRow[]
  return rows.map((row) => ({
    id: row.id,
    url: mediaUrl(row.id),
    createdAt: row.created_at,
  }))
}

export function sleepOn(date: string): SleepDay | null {
  const row = getDb().prepare("SELECT * FROM sleep_days WHERE date = ?").get(date) as
    | SleepRow
    | undefined
  const screenshots = screenshotsFor(date)
  if (!row && screenshots.length === 0) {
    return null
  }
  return {
    date,
    bedtime: row?.bedtime ?? null,
    wakeTime: row?.wake_time ?? null,
    durationMinutes: row?.duration_minutes ?? null,
    stages: row ? parseStages(row.stages_json) : [],
    screenshots,
  }
}

export function listSleep(before: string, limit: number): SleepDay[] {
  const rows = getDb()
    .prepare(
      `SELECT date FROM (
         SELECT date FROM sleep_days WHERE date <= ?
         UNION
         SELECT date FROM sleep_screenshots WHERE date <= ?
       )
       ORDER BY date DESC
       LIMIT ?`,
    )
    .all(before, before, limit) as { date: string }[]
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

export async function addScreenshot(
  date: string,
  file: File,
): Promise<{ id: string; date: string; url: string; createdAt: string }> {
  if (!isRealDay(date)) {
    invalid()
  }
  let image
  try {
    image = await readImage(file)
  } catch {
    invalid()
  }
  if (!image) {
    invalid()
  }
  const id = randomUUID()
  const createdAt = nowIso()
  const relative = saveUpload(id, image.ext, image.bytes)
  try {
    const db = getDb()
    db.transaction(() => {
      db.prepare("INSERT INTO media (id, path, mime) VALUES (?, ?, ?)").run(id, relative, image.mime)
      db.prepare("INSERT INTO sleep_screenshots (id, date, created_at) VALUES (?, ?, ?)").run(
        id,
        date,
        createdAt,
      )
    })()
  } catch (error) {
    deleteUpload(relative)
    throw error
  }
  publish("sleep")
  return { id, date, url: mediaUrl(id), createdAt }
}

export function deleteScreenshot(id: string): void {
  const db = getDb()
  const row = db
    .prepare(
      "SELECT sleep_screenshots.id AS id, media.path AS path FROM sleep_screenshots JOIN media ON media.id = sleep_screenshots.id WHERE sleep_screenshots.id = ?",
    )
    .get(id) as { id: string; path: string } | undefined
  if (!row) {
    throw new ApiError("not_found", 404)
  }
  db.transaction(() => {
    db.prepare("DELETE FROM sleep_screenshots WHERE id = ?").run(id)
    db.prepare("DELETE FROM media WHERE id = ?").run(id)
  })()
  deleteUpload(row.path)
  publish("sleep")
}
