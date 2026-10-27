import { ApiError, invalid } from "@/lib/errors"
import { isRealDay } from "@/lib/time"

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) {
    invalid()
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    invalid()
  }
}

export async function readForm(request: Request): Promise<FormData> {
  try {
    return await request.formData()
  } catch {
    invalid()
  }
}

export function parseLimit(raw: string | null, fallback: number, max: number): number {
  if (raw == null || raw === "") {
    return fallback
  }
  if (!/^\d+$/.test(raw)) {
    throw new ApiError("invalid", 400)
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new ApiError("invalid", 400)
  }
  return Math.min(value, max)
}

export function parseBefore(raw: string | null, fallback: string): string {
  if (raw == null || raw === "") {
    return fallback
  }
  if (!isRealDay(raw)) {
    throw new ApiError("invalid", 400)
  }
  return raw
}

export function mediaUrl(id: string): string {
  return `/api/media/${id}`
}
