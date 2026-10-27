import { randomUUID } from "node:crypto"

import { z } from "zod"

import { getDb } from "@/lib/db"
import { ApiError, invalid } from "@/lib/errors"
import { publish } from "@/lib/live"
import { formatIso, nowIso, parseInstant, statusTimeZone } from "@/lib/time"
import { LEVELS, type Level, type Phrase, type StatusSegment } from "@/lib/types"

type SegmentRow = {
  id: string
  level: Level
  content: string
  started_at: string
  ended_at: string | null
}

const postSchema = z.object({
  level: z.enum(LEVELS),
  content: z.string(),
  startedAt: z.string().optional(),
})

const patchSchema = z.object({
  level: z.enum(LEVELS).optional(),
  content: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().nullable().optional(),
})

function toSegment(row: SegmentRow): StatusSegment {
  return {
    id: row.id,
    level: row.level,
    content: row.content,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  }
}

function rangesOverlap(
  aStart: number,
  aEnd: number | null,
  bStart: number,
  bEnd: number | null,
): boolean {
  const aStop = aEnd ?? Number.POSITIVE_INFINITY
  const bStop = bEnd ?? Number.POSITIVE_INFINITY
  return aStart < bStop && bStart < aStop
}

function rowBounds(row: SegmentRow): { start: number; end: number | null } {
  return {
    start: Date.parse(row.started_at),
    end: row.ended_at ? Date.parse(row.ended_at) : null,
  }
}

function allSegments(): SegmentRow[] {
  return getDb().prepare("SELECT * FROM status_segments").all() as SegmentRow[]
}

function upsertPhrase(text: string, usedAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO status_phrases (id, text, last_used_at)
       VALUES (?, ?, ?)
       ON CONFLICT(text) DO UPDATE SET last_used_at = excluded.last_used_at`,
    )
    .run(randomUUID(), text, usedAt)
}

function requireContent(value: string): string {
  const content = value.trim()
  if (!content) {
    invalid()
  }
  return content
}

function requireInstant(value: string, timeZone: string): string {
  const date = parseInstant(value)
  if (!date) {
    invalid()
  }
  return formatIso(date, timeZone)
}

export function listStatus(limit: number): StatusSegment[] {
  const rows = getDb()
    .prepare("SELECT * FROM status_segments ORDER BY started_at DESC LIMIT ?")
    .all(limit) as SegmentRow[]
  return rows.map(toSegment)
}

export function segmentsOverlapping(dayStartIso: string, dayEndIso: string): StatusSegment[] {
  const startMs = Date.parse(dayStartIso)
  const endMs = Date.parse(dayEndIso)
  return allSegments()
    .filter((row) => {
      const bounds = rowBounds(row)
      return rangesOverlap(bounds.start, bounds.end, startMs, endMs)
    })
    .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
    .map(toSegment)
}

export function currentStatus(now: string): StatusSegment | null {
  const nowMs = Date.parse(now)
  const open = allSegments()
    .filter((row) => row.ended_at === null && Date.parse(row.started_at) <= nowMs)
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))
  const row = open[0]
  return row ? toSegment(row) : null
}

export function createStatus(body: unknown): StatusSegment {
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    invalid()
  }
  const timeZone = statusTimeZone()
  const content = requireContent(parsed.data.content)
  const startedAt = parsed.data.startedAt
    ? requireInstant(parsed.data.startedAt, timeZone)
    : nowIso(timeZone)
  const startedMs = Date.parse(startedAt)
  if (startedMs - Date.now() > 5 * 60 * 1000) {
    invalid()
  }
  const level = parsed.data.level
  const id = randomUUID()
  const db = getDb()
  const segment = db.transaction(() => {
    const rows = allSegments()
    const closers: string[] = []
    for (const row of rows) {
      const bounds = rowBounds(row)
      if (!rangesOverlap(startedMs, null, bounds.start, bounds.end)) {
        continue
      }
      if (row.ended_at === null && bounds.start < startedMs) {
        closers.push(row.id)
        continue
      }
      throw new ApiError("overlap", 409)
    }
    const close = db.prepare("UPDATE status_segments SET ended_at = ? WHERE id = ?")
    for (const closerId of closers) {
      close.run(startedAt, closerId)
    }
    db.prepare(
      "INSERT INTO status_segments (id, level, content, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)",
    ).run(id, level, content, startedAt)
    upsertPhrase(content, nowIso(timeZone))
    const row = db.prepare("SELECT * FROM status_segments WHERE id = ?").get(id) as SegmentRow
    return toSegment(row)
  })()
  publish("status")
  return segment
}

export function updateStatus(id: string, body: unknown): StatusSegment {
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    invalid()
  }
  const timeZone = statusTimeZone()
  const db = getDb()
  const segment = db.transaction(() => {
    const current = db.prepare("SELECT * FROM status_segments WHERE id = ?").get(id) as
      | SegmentRow
      | undefined
    if (!current) {
      throw new ApiError("not_found", 404)
    }
    const level = parsed.data.level ?? current.level
    const content =
      parsed.data.content === undefined ? current.content : requireContent(parsed.data.content)
    const startedAt =
      parsed.data.startedAt === undefined
        ? current.started_at
        : requireInstant(parsed.data.startedAt, timeZone)
    let endedAt = current.ended_at
    if (parsed.data.endedAt !== undefined) {
      endedAt = parsed.data.endedAt === null ? null : requireInstant(parsed.data.endedAt, timeZone)
    }
    const startedMs = Date.parse(startedAt)
    const endedMs = endedAt ? Date.parse(endedAt) : null
    if (endedMs !== null && endedMs <= startedMs) {
      invalid()
    }
    for (const row of allSegments()) {
      if (row.id === id) {
        continue
      }
      const bounds = rowBounds(row)
      if (rangesOverlap(startedMs, endedMs, bounds.start, bounds.end)) {
        throw new ApiError("overlap", 409)
      }
    }
    db.prepare(
      "UPDATE status_segments SET level = ?, content = ?, started_at = ?, ended_at = ? WHERE id = ?",
    ).run(level, content, startedAt, endedAt, id)
    if (parsed.data.content !== undefined) {
      upsertPhrase(content, nowIso(timeZone))
    }
    const row = db.prepare("SELECT * FROM status_segments WHERE id = ?").get(id) as SegmentRow
    return toSegment(row)
  })()
  publish("status")
  return segment
}

export function deleteStatus(id: string): void {
  const result = getDb().prepare("DELETE FROM status_segments WHERE id = ?").run(id)
  if (result.changes === 0) {
    throw new ApiError("not_found", 404)
  }
  publish("status")
}

export function listPhrases(): Phrase[] {
  const rows = getDb()
    .prepare("SELECT id, text, last_used_at FROM status_phrases ORDER BY last_used_at DESC, text ASC")
    .all() as { id: string; text: string; last_used_at: string }[]
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    lastUsedAt: row.last_used_at,
  }))
}

export function deletePhrase(id: string): void {
  const result = getDb().prepare("DELETE FROM status_phrases WHERE id = ?").run(id)
  if (result.changes === 0) {
    throw new ApiError("not_found", 404)
  }
}
