import { randomUUID } from "node:crypto"

import ical, { type VEvent } from "node-ical"
import { z } from "zod"

import { getDb } from "@/lib/db"
import { ApiError, invalid } from "@/lib/errors"
import { publish } from "@/lib/live"
import {
  addDays,
  dayKey,
  formatIso,
  nowIso,
  parseInstant,
  statusTimeZone,
  todayKey,
  zonedMidnight,
} from "@/lib/time"
import type { CalendarEventView, CalendarSubscription } from "@/lib/types"

type SubscriptionRow = {
  id: string
  name: string
  url: string
  last_ok_at: string | null
  last_error: string | null
}

type EventRow = {
  id: string
  uid: string
  title: string
  start_at: string
  end_at: string
  all_day: number
  day: string
  calendar_name: string
}

type CalendarState = {
  timer?: ReturnType<typeof setInterval>
  inflight?: Promise<void>
}

const globalKey = "__nfwStatusCalendar"
const refreshWaitMs = 60 * 60 * 1000

class CalendarHttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super("http")
    this.status = status
  }
}

class CalendarParseError extends Error {
  constructor() {
    super("invalid calendar")
  }
}

const postSchema = z.object({
  name: z.string(),
  url: z.string(),
})

function runtime(): CalendarState {
  const root = globalThis as typeof globalThis & { [globalKey]?: CalendarState }
  if (!root[globalKey]) {
    root[globalKey] = {}
  }
  return root[globalKey]
}

function toSubscription(row: SubscriptionRow): CalendarSubscription {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    lastOkAt: row.last_ok_at,
    lastError: row.last_error,
  }
}

function plainText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (value && typeof value === "object" && "val" in value) {
    const inner = (value as { val: unknown }).val
    return typeof inner === "string" ? inner : ""
  }
  return ""
}

function isCancelled(status: unknown): boolean {
  const text = plainText(status).trim().toUpperCase()
  return text === "CANCELLED"
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function failureMessage(error: unknown): string {
  if (error instanceof CalendarHttpError) {
    return `HTTP ${error.status}`
  }
  if (error instanceof CalendarParseError) {
    return "invalid calendar"
  }
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "timed out"
  }
  return "fetch failed"
}

function localDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

type StoredEvent = {
  uid: string
  title: string
  startAt: string
  endAt: string
  allDay: number
}

function instancesForToday(
  event: VEvent,
  day: string,
  timeZone: string
): StoredEvent[] {
  const window = {
    start: zonedMidnight(day, timeZone),
    end: zonedMidnight(addDays(day, 1), timeZone),
  }
  let instances
  try {
    instances = ical.expandRecurringEvent(event, {
      from: zonedMidnight(addDays(day, -3), timeZone),
      to: zonedMidnight(addDays(day, 3), timeZone),
      excludeExdates: true,
      includeOverrides: true,
      expandOngoing: true,
    })
  } catch {
    return []
  }
  const stored: StoredEvent[] = []
  for (const instance of instances) {
    if (
      isCancelled(instance.event.status) ||
      !(instance.start instanceof Date) ||
      !(instance.end instanceof Date)
    ) {
      continue
    }
    const title = plainText(instance.summary).trim() || "Untitled"
    const uid = instance.event.uid
    if (!uid) {
      continue
    }
    if (instance.isFullDay) {
      const startDay = localDay(instance.start)
      let endDay = localDay(instance.end)
      if (endDay <= startDay) {
        endDay = addDays(startDay, 1)
      }
      if (!(startDay <= day && day < endDay)) {
        continue
      }
      stored.push({
        uid,
        title,
        startAt: formatIso(zonedMidnight(startDay, timeZone), timeZone),
        endAt: formatIso(zonedMidnight(endDay, timeZone), timeZone),
        allDay: 1,
      })
      continue
    }
    if (instance.end.getTime() <= instance.start.getTime()) {
      continue
    }
    if (!(instance.start < window.end && instance.end > window.start)) {
      continue
    }
    stored.push({
      uid,
      title,
      startAt: formatIso(instance.start, timeZone),
      endAt: formatIso(instance.end, timeZone),
      allDay: 0,
    })
  }
  return stored
}

async function fetchCalendar(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "nfw-status/0.1",
      },
    })
  } catch (error) {
    if (
      error instanceof CalendarHttpError ||
      error instanceof CalendarParseError
    ) {
      throw error
    }
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ) {
      throw error
    }
    throw new Error("fetch failed")
  }
  if (!response.ok) {
    throw new CalendarHttpError(response.status)
  }
  return response.text()
}

function eventsFromIcs(
  text: string,
  day: string,
  timeZone: string
): StoredEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new CalendarParseError()
  }
  let parsed
  try {
    parsed = ical.parseICS(text)
  } catch {
    throw new CalendarParseError()
  }
  const collected: StoredEvent[] = []
  const seen = new Set<string>()
  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") {
      continue
    }
    const event = component as VEvent
    if (isCancelled(event.status) || !event.start) {
      continue
    }
    for (const item of instancesForToday(event, day, timeZone)) {
      const key = `${item.uid}\t${item.startAt}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      collected.push(item)
    }
  }
  return collected
}

function replaceSubscriptionDay(
  subscriptionId: string,
  day: string,
  events: StoredEvent[],
  okAt: string
): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO calendar_events
      (id, subscription_id, uid, title, start_at, end_at, all_day, day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  db.transaction(() => {
    db.prepare(
      "DELETE FROM calendar_events WHERE subscription_id = ? AND day = ?"
    ).run(subscriptionId, day)
    for (const event of events) {
      insert.run(
        randomUUID(),
        subscriptionId,
        event.uid,
        event.title,
        event.startAt,
        event.endAt,
        event.allDay,
        day
      )
    }
    db.prepare(
      "UPDATE calendar_subscriptions SET last_ok_at = ?, last_error = NULL WHERE id = ?"
    ).run(okAt, subscriptionId)
  })()
}

function recordFailure(subscriptionId: string, message: string): void {
  getDb()
    .prepare("UPDATE calendar_subscriptions SET last_error = ? WHERE id = ?")
    .run(message, subscriptionId)
}

async function refreshSubscription(
  row: SubscriptionRow,
  day: string,
  timeZone: string
): Promise<void> {
  const text = await fetchCalendar(row.url)
  const events = eventsFromIcs(text, day, timeZone)
  replaceSubscriptionDay(row.id, day, events, nowIso(timeZone))
}

function listRows(): SubscriptionRow[] {
  return getDb()
    .prepare(
      "SELECT id, name, url, last_ok_at, last_error FROM calendar_subscriptions ORDER BY rowid ASC"
    )
    .all() as SubscriptionRow[]
}

function markRefreshed(timeZone: string): void {
  getDb()
    .prepare("UPDATE calendar_state SET refreshed_at = ? WHERE id = 1")
    .run(nowIso(timeZone))
}

async function runRefresh(): Promise<void> {
  const timeZone = statusTimeZone()
  const day = todayKey(timeZone)
  try {
    for (const row of listRows()) {
      try {
        await refreshSubscription(row, day, timeZone)
      } catch (error) {
        recordFailure(row.id, failureMessage(error))
      }
    }
  } finally {
    try {
      markRefreshed(timeZone)
    } finally {
      publish("calendar")
    }
  }
}

export function refreshCalendars(): Promise<void> {
  const current = runtime()
  if (!current.inflight) {
    current.inflight = runRefresh().finally(() => {
      current.inflight = undefined
    })
  }
  return current.inflight
}

export function startCalendarScheduler(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return
  }
  const current = runtime()
  if (current.timer) {
    return
  }
  const timer = setInterval(() => {
    void refreshCalendars()
  }, refreshWaitMs)
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref()
  }
  current.timer = timer
  void refreshCalendars()
}

function refreshedAt(): string | null {
  const row = getDb()
    .prepare("SELECT refreshed_at FROM calendar_state WHERE id = 1")
    .get() as { refreshed_at: string | null } | undefined
  return row?.refreshed_at ?? null
}

function refreshedDay(timeZone: string): string | null {
  const refreshed = refreshedAt()
  if (!refreshed) {
    return null
  }
  const date = parseInstant(refreshed)
  if (!date) {
    return null
  }
  return dayKey(date, timeZone)
}

export async function refreshIfStale(): Promise<void> {
  const count = getDb()
    .prepare("SELECT COUNT(*) AS count FROM calendar_subscriptions")
    .get() as {
    count: number
  }
  if (count.count < 1) {
    return
  }
  const timeZone = statusTimeZone()
  const refreshed = refreshedAt()
  const staleByTime =
    refreshed == null || Date.now() - Date.parse(refreshed) > refreshWaitMs
  const staleByDay = refreshedDay(timeZone) !== todayKey(timeZone)
  if (!staleByTime && !staleByDay) {
    return
  }
  const pending = refreshCalendars().catch(() => {
    console.error("Calendar refresh failed")
  })
  await Promise.race([
    pending,
    new Promise<void>((resolve) => setTimeout(resolve, 8000)),
  ])
}

export function listSubscriptions(): CalendarSubscription[] {
  return listRows().map(toSubscription)
}

export function subscriptionById(id: string): CalendarSubscription {
  const row = getDb()
    .prepare(
      "SELECT id, name, url, last_ok_at, last_error FROM calendar_subscriptions WHERE id = ?"
    )
    .get(id) as SubscriptionRow | undefined
  if (!row) {
    throw new ApiError("not_found", 404)
  }
  return toSubscription(row)
}

export async function createSubscription(
  body: unknown
): Promise<CalendarSubscription> {
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) {
    invalid()
  }
  const name = parsed.data.name.trim()
  const url = parsed.data.url.trim()
  if (!name || !isHttpUrl(url)) {
    invalid()
  }
  const id = randomUUID()
  getDb()
    .prepare(
      "INSERT INTO calendar_subscriptions (id, name, url, last_ok_at, last_error) VALUES (?, ?, ?, NULL, NULL)"
    )
    .run(id, name, url)
  try {
    await refreshCalendars()
  } catch {
    console.error("Calendar refresh failed")
  }
  return subscriptionById(id)
}

export function deleteSubscription(id: string): void {
  const result = getDb()
    .prepare("DELETE FROM calendar_subscriptions WHERE id = ?")
    .run(id)
  if (result.changes === 0) {
    throw new ApiError("not_found", 404)
  }
  publish("calendar")
}

function toEvents(rows: EventRow[]): CalendarEventView[] {
  const seen = new Set<string>()
  const events: CalendarEventView[] = []
  for (const row of rows) {
    const key = `${row.uid}\t${row.start_at}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    events.push({
      id: row.id,
      title: row.title,
      start: row.start_at,
      end: row.end_at,
      allDay: row.all_day === 1,
      calendarName: row.calendar_name,
    })
  }
  events.sort((a, b) => {
    if (a.allDay !== b.allDay) {
      return a.allDay ? -1 : 1
    }
    return Date.parse(a.start) - Date.parse(b.start)
  })
  return events
}

export function eventsBetween(
  startDay: string,
  endDay: string
): Map<string, CalendarEventView[]> {
  const rows = getDb()
    .prepare(
      `SELECT e.id, e.uid, e.title, e.start_at, e.end_at, e.all_day, e.day, s.name AS calendar_name
       FROM calendar_events e
       JOIN calendar_subscriptions s ON s.id = e.subscription_id
       WHERE e.day >= ? AND e.day <= ?
       ORDER BY e.day ASC, s.rowid ASC, e.rowid ASC`
    )
    .all(startDay, endDay) as EventRow[]
  const grouped = new Map<string, EventRow[]>()
  for (const row of rows) {
    const list = grouped.get(row.day) ?? []
    list.push(row)
    grouped.set(row.day, list)
  }
  const events = new Map<string, CalendarEventView[]>()
  for (const [day, list] of grouped) {
    events.set(day, toEvents(list))
  }
  return events
}

export function eventsOnDay(day: string): CalendarEventView[] {
  return eventsBetween(day, day).get(day) ?? []
}
