import { randomUUID } from "node:crypto"

import { getDb } from "@/lib/db"
import { ApiError, invalid } from "@/lib/errors"
import { deleteUpload, previewDataUrl, readImage, saveUpload, writePreview } from "@/lib/files"
import { mediaUrl } from "@/lib/http"
import { publish } from "@/lib/live"
import { dayKey, formatIso, parseInstant, statusTimeZone } from "@/lib/time"
import { isSlot, type Meal, type MealPhoto, type Slot } from "@/lib/types"

type MealRow = {
  id: string
  day: string
  slot: Slot
  eaten_at: string
}

type PhotoRow = {
  id: string
  meal_id: string
  sort: number
}

async function toPhoto(id: string): Promise<MealPhoto> {
  return { id, url: mediaUrl(id), preview: await previewDataUrl(id) }
}

async function loadPhotos(mealIds: string[]): Promise<Map<string, MealPhoto[]>> {
  const grouped = new Map<string, MealPhoto[]>()
  if (mealIds.length === 0) {
    return grouped
  }
  const marks = mealIds.map(() => "?").join(", ")
  const rows = getDb()
    .prepare(
      `SELECT id, meal_id, sort FROM meal_photos WHERE meal_id IN (${marks}) ORDER BY sort ASC, id ASC`
    )
    .all(...mealIds) as PhotoRow[]
  for (const row of rows) {
    const list = grouped.get(row.meal_id) ?? []
    list.push(await toPhoto(row.id))
    grouped.set(row.meal_id, list)
  }
  return grouped
}

function slotRank(slot: Slot): number {
  if (slot === "dinner") return 0
  if (slot === "lunch") return 1
  return 2
}

function toMeal(row: MealRow, photos: MealPhoto[]): Meal {
  return {
    id: row.id,
    day: row.day,
    slot: row.slot,
    eatenAt: row.eaten_at,
    photos,
  }
}

const mealOrder = `day DESC,
         CASE slot WHEN 'dinner' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END,
         eaten_at DESC,
         id DESC`

export async function listMeals(
  before: string,
  limit: number,
  beforeId?: string,
): Promise<{ meals: Meal[]; hasMore: boolean }> {
  const db = getDb()
  let rows: MealRow[]
  if (beforeId) {
    const cursor = getMealRow(beforeId)
    if (!cursor) {
      invalid()
    }
    const rank = slotRank(cursor.slot)
    rows = db
      .prepare(
        `SELECT id, day, slot, eaten_at FROM meals
         WHERE day < ?
            OR (day = ? AND CASE slot WHEN 'dinner' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END > ?)
            OR (day = ? AND CASE slot WHEN 'dinner' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END = ? AND eaten_at < ?)
            OR (day = ? AND CASE slot WHEN 'dinner' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END = ? AND eaten_at = ? AND id < ?)
         ORDER BY ${mealOrder}
         LIMIT ?`,
      )
      .all(
        cursor.day,
        cursor.day,
        rank,
        cursor.day,
        rank,
        cursor.eaten_at,
        cursor.day,
        rank,
        cursor.eaten_at,
        cursor.id,
        limit + 1,
      ) as MealRow[]
  } else {
    rows = db
      .prepare(
        `SELECT id, day, slot, eaten_at FROM meals
         WHERE day <= ?
         ORDER BY ${mealOrder}
         LIMIT ?`,
      )
      .all(before, limit + 1) as MealRow[]
  }
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const photos = await loadPhotos(page.map((row) => row.id))
  return {
    meals: page.map((row) => toMeal(row, photos.get(row.id) ?? [])),
    hasMore,
  }
}

export function mealsBetween(startDay: string, endDay: string): Meal[] {
  const rows = getDb()
    .prepare(
      `SELECT id, day, slot, eaten_at FROM meals
       WHERE day >= ? AND day <= ?
       ORDER BY day ASC,
         CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END,
         eaten_at ASC`
    )
    .all(startDay, endDay) as MealRow[]
  return rows.map((row) => toMeal(row, []))
}

export async function mealsOnDay(day: string): Promise<Meal[]> {
  const rows = getDb()
    .prepare(
      `SELECT id, day, slot, eaten_at FROM meals
       WHERE day = ?
       ORDER BY CASE slot WHEN 'breakfast' THEN 0 WHEN 'lunch' THEN 1 ELSE 2 END`
    )
    .all(day) as MealRow[]
  const photos = await loadPhotos(rows.map((row) => row.id))
  return rows.map((row) => toMeal(row, photos.get(row.id) ?? []))
}

function getMealRow(id: string): MealRow | undefined {
  return getDb()
    .prepare("SELECT id, day, slot, eaten_at FROM meals WHERE id = ?")
    .get(id) as MealRow | undefined
}

async function mealById(id: string): Promise<Meal> {
  const row = getMealRow(id)
  if (!row) {
    throw new ApiError("not_found", 404)
  }
  const photos = (await loadPhotos([id])).get(id) ?? []
  return toMeal(row, photos)
}

async function collectPhotos(
  form: FormData
): Promise<{ mime: string; ext: string; bytes: Buffer }[]> {
  const photos = []
  for (const entry of form.getAll("photo")) {
    if (!(entry instanceof File)) {
      continue
    }
    try {
      const image = await readImage(entry)
      if (image) {
        photos.push(image)
      }
    } catch {
      invalid()
    }
  }
  return photos
}

function eatenFields(eatenAtRaw: string): { day: string; eatenAt: string } {
  const date = parseInstant(eatenAtRaw)
  if (!date) {
    invalid()
  }
  const timeZone = statusTimeZone()
  return {
    day: dayKey(date, timeZone),
    eatenAt: formatIso(date, timeZone),
  }
}

function assertSlotFree(day: string, slot: Slot, ignoreId?: string): void {
  const existing = getDb()
    .prepare("SELECT id FROM meals WHERE day = ? AND slot = ?")
    .get(day, slot) as { id: string } | undefined
  if (existing && existing.id !== ignoreId) {
    throw new ApiError("exists", 409, { id: existing.id })
  }
}

function formString(form: FormData, name: string): string | null {
  const value = form.get(name)
  return typeof value === "string" ? value : null
}

export async function createMeal(form: FormData): Promise<Meal> {
  const slotRaw = formString(form, "slot")
  const eatenRaw = formString(form, "eatenAt")
  if (!slotRaw || !isSlot(slotRaw) || !eatenRaw) {
    invalid()
  }
  const slot = slotRaw
  const { day, eatenAt } = eatenFields(eatenRaw)
  const images = await collectPhotos(form)
  assertSlotFree(day, slot)
  const id = randomUUID()
  const saved: { id: string; path: string }[] = []
  try {
    for (const image of images) {
      const photoId = randomUUID()
      const relative = saveUpload(photoId, image.ext, image.bytes)
      await writePreview(photoId, image.bytes)
      saved.push({ id: photoId, path: relative })
    }
    const db = getDb()
    db.transaction(() => {
      db.prepare(
        "INSERT INTO meals (id, day, slot, eaten_at) VALUES (?, ?, ?, ?)"
      ).run(id, day, slot, eatenAt)
      const insertMedia = db.prepare(
        "INSERT INTO media (id, path, mime) VALUES (?, ?, ?)"
      )
      const insertPhoto = db.prepare(
        "INSERT INTO meal_photos (id, meal_id, sort) VALUES (?, ?, ?)"
      )
      images.forEach((image, index) => {
        const photo = saved[index]
        if (!photo) {
          return
        }
        insertMedia.run(photo.id, photo.path, image.mime)
        insertPhoto.run(photo.id, id, index)
      })
    })()
  } catch (error) {
    for (const photo of saved) {
      deleteUpload(photo.path)
    }
    if (error instanceof ApiError) {
      throw error
    }
    const code = (error as { code?: string }).code
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") {
      const existing = getDb()
        .prepare("SELECT id FROM meals WHERE day = ? AND slot = ?")
        .get(day, slot) as { id: string } | undefined
      throw new ApiError("exists", 409, { id: existing?.id ?? id })
    }
    throw error
  }
  publish("meal")
  return mealById(id)
}

export async function updateMeal(id: string, form: FormData): Promise<Meal> {
  const current = getMealRow(id)
  if (!current) {
    throw new ApiError("not_found", 404)
  }
  const slotRaw = formString(form, "slot")
  const eatenRaw = formString(form, "eatenAt")
  let slot = current.slot
  let day = current.day
  let eatenAt = current.eaten_at
  if (slotRaw !== null) {
    if (!isSlot(slotRaw)) {
      invalid()
    }
    slot = slotRaw
  }
  if (eatenRaw !== null) {
    const next = eatenFields(eatenRaw)
    day = next.day
    eatenAt = next.eatenAt
  }
  const removeIds = [
    ...new Set(
      form
        .getAll("removePhotoIds")
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0
        )
    ),
  ]
  const owned = getDb()
    .prepare(
      "SELECT meal_photos.id AS id, media.path AS path FROM meal_photos JOIN media ON media.id = meal_photos.id WHERE meal_photos.meal_id = ?"
    )
    .all(id) as { id: string; path: string }[]
  const ownedIds = new Set(owned.map((photo) => photo.id))
  for (const photoId of removeIds) {
    if (!ownedIds.has(photoId)) {
      invalid()
    }
  }
  const images = await collectPhotos(form)
  assertSlotFree(day, slot, id)
  const saved: { id: string; path: string; mime: string }[] = []
  try {
    for (const image of images) {
      const photoId = randomUUID()
      const relative = saveUpload(photoId, image.ext, image.bytes)
      await writePreview(photoId, image.bytes)
      saved.push({ id: photoId, path: relative, mime: image.mime })
    }
    const db = getDb()
    db.transaction(() => {
      db.prepare(
        "UPDATE meals SET day = ?, slot = ?, eaten_at = ? WHERE id = ?"
      ).run(day, slot, eatenAt, id)
      if (removeIds.length > 0) {
        const marks = removeIds.map(() => "?").join(", ")
        db.prepare(
          `DELETE FROM meal_photos WHERE meal_id = ? AND id IN (${marks})`
        ).run(id, ...removeIds)
        db.prepare(`DELETE FROM media WHERE id IN (${marks})`).run(...removeIds)
      }
      const sortRow = db
        .prepare(
          "SELECT COALESCE(MAX(sort), -1) AS sort FROM meal_photos WHERE meal_id = ?"
        )
        .get(id) as { sort: number }
      let sort = sortRow.sort
      const insertMedia = db.prepare(
        "INSERT INTO media (id, path, mime) VALUES (?, ?, ?)"
      )
      const insertPhoto = db.prepare(
        "INSERT INTO meal_photos (id, meal_id, sort) VALUES (?, ?, ?)"
      )
      for (const photo of saved) {
        sort += 1
        insertMedia.run(photo.id, photo.path, photo.mime)
        insertPhoto.run(photo.id, id, sort)
      }
    })()
  } catch (error) {
    for (const photo of saved) {
      deleteUpload(photo.path)
    }
    if (error instanceof ApiError) {
      throw error
    }
    const code = (error as { code?: string }).code
    if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT") {
      const existing = getDb()
        .prepare("SELECT id FROM meals WHERE day = ? AND slot = ?")
        .get(day, slot) as { id: string } | undefined
      throw new ApiError("exists", 409, { id: existing?.id ?? id })
    }
    throw error
  }
  for (const photo of owned) {
    if (removeIds.includes(photo.id)) {
      deleteUpload(photo.path)
    }
  }
  publish("meal")
  return mealById(id)
}

export function deleteMeal(id: string): void {
  const db = getDb()
  const photos = db
    .prepare(
      "SELECT meal_photos.id AS id, media.path AS path FROM meal_photos JOIN media ON media.id = meal_photos.id WHERE meal_id = ?"
    )
    .all(id) as { id: string; path: string }[]
  const result = db.transaction(() => {
    for (const photo of photos) {
      db.prepare("DELETE FROM media WHERE id = ?").run(photo.id)
    }
    return db.prepare("DELETE FROM meals WHERE id = ?").run(id)
  })()
  if (result.changes === 0) {
    throw new ApiError("not_found", 404)
  }
  for (const photo of photos) {
    deleteUpload(photo.path)
  }
  publish("meal")
}
