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
})

function rejectEndedAt(body: unknown): void {
  if (typeof body === "object" && body !== null && "endedAt" in body) {
    invalid()
  }
}

function orderedRows(): SegmentRow[] {
  return getDb()
    .prepare(
      "SELECT id, level, content, started_at FROM status_segments ORDER BY started_at ASC, id ASC",
    )
    .all() as SegmentRow[]
}

function withEnds(rows: SegmentRow[]): StatusSegment[] {
  return rows.map((row, index) => ({
    id: row.id,
    level: row.level,
    content: row.content,
    startedAt: row.started_at,
    endedAt: index + 1 < rows.length ? rows[index + 1].started_at : null,
  }))
}

function segmentById(id: string): StatusSegment {
  const segment = withEnds(orderedRows()).find((item) => item.id === id)
  if (!segment) {
    throw new ApiError("not_found", 404)
  }
  return segment
}

function covers(segment: StatusSegment, startMs: number, endMs: number, nowMs: number): boolean {
  const start = Date.parse(segment.startedAt)
  const stop = segment.endedAt === null ? nowMs : Date.parse(segment.endedAt)
  return start < stop && start < endMs && stop > startMs
}

function assertUniqueStart(startedAt: string, exceptId?: string): void {
  const startedMs = Date.parse(startedAt)
  const taken = orderedRows().some(
    (row) => row.id !== exceptId && Date.parse(row.started_at) === startedMs,
  )
  if (taken) {
    throw new ApiError("overlap", 409)
  }
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
  const segments = withEnds(orderedRows())
  return segments.slice(Math.max(0, segments.length - limit)).reverse()
}

export function segmentsOverlapping(
  dayStartIso: string,
  dayEndIso: string,
  now: string,
): StatusSegment[] {
  const startMs = Date.parse(dayStartIso)
  const endMs = Date.parse(dayEndIso)
  const nowMs = Date.parse(now)
  return withEnds(orderedRows()).filter((segment) => covers(segment, startMs, endMs, nowMs))
}

export function currentStatus(now: string): StatusSegment | null {
  const nowMs = Date.parse(now)
  let current: StatusSegment | null = null
  for (const segment of withEnds(orderedRows())) {
    if (Date.parse(segment.startedAt) <= nowMs) {
      current = segment
    }
  }
  return current
}

export function createStatus(body: unknown): StatusSegment {
  rejectEndedAt(body)
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
    assertUniqueStart(startedAt)
    db.prepare(
      "INSERT INTO status_segments (id, level, content, started_at) VALUES (?, ?, ?, ?)",
    ).run(id, level, content, startedAt)
    upsertPhrase(content, nowIso(timeZone))
    return segmentById(id)
  })()
  publish("status")
  return segment
}

export function updateStatus(id: string, body: unknown): StatusSegment {
  rejectEndedAt(body)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    invalid()
  }
  const timeZone = statusTimeZone()
  const db = getDb()
  const segment = db.transaction(() => {
    const current = db
      .prepare("SELECT id, level, content, started_at FROM status_segments WHERE id = ?")
      .get(id) as SegmentRow | undefined
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
    assertUniqueStart(startedAt, id)
    db.prepare("UPDATE status_segments SET level = ?, content = ?, started_at = ? WHERE id = ?").run(
      level,
      content,
      startedAt,
      id,
    )
    if (parsed.data.content !== undefined) {
      upsertPhrase(content, nowIso(timeZone))
    }
    return segmentById(id)
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
