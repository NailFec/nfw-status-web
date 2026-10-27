import fs from "node:fs"
import path from "node:path"

import { uploadsDir } from "@/lib/db"

const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
} as const

export type StoredImage = {
  mime: keyof typeof MIME_EXT
  ext: string
  bytes: Buffer
}

const MAX_BYTES = 20 * 1024 * 1024

function matchesMagic(mime: keyof typeof MIME_EXT, bytes: Buffer): boolean {
  if (bytes.length < 12) {
    return false
  }
  if (mime === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mime === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  }
  if (mime === "image/gif") {
    const header = bytes.subarray(0, 6).toString("ascii")
    return header === "GIF87a" || header === "GIF89a"
  }
  const riff = bytes.subarray(0, 4).toString("ascii")
  const webp = bytes.subarray(8, 12).toString("ascii")
  return riff === "RIFF" && webp === "WEBP"
}

export async function readImage(file: File): Promise<StoredImage | null> {
  if (file.size === 0) {
    return null
  }
  if (file.size > MAX_BYTES) {
    throw new Error("too-large")
  }
  const mime = file.type
  if (!(mime in MIME_EXT)) {
    throw new Error("mime")
  }
  const typed = mime as keyof typeof MIME_EXT
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!matchesMagic(typed, bytes)) {
    throw new Error("mime")
  }
  return { mime: typed, ext: MIME_EXT[typed], bytes }
}

export function saveUpload(id: string, ext: string, bytes: Buffer): string {
  const relative = `uploads/${id}.${ext}`
  const root = path.resolve(uploadsDir())
  const target = path.resolve(root, `${id}.${ext}`)
  if (target !== path.join(root, `${id}.${ext}`)) {
    throw new Error("path")
  }
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(target, bytes)
  return relative
}

export function deleteUpload(relativePath: string): void {
  const resolved = resolveUpload(relativePath)
  if (!resolved) {
    return
  }
  try {
    fs.unlinkSync(resolved)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Failed to delete upload")
    }
  }
}

export function resolveUpload(relativePath: string): string | null {
  if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath)) {
    return null
  }
  if (relativePath.split(/[/\\]/).includes("..")) {
    return null
  }
  const root = path.resolve(uploadsDir())
  const resolved = path.resolve(path.join(dataRoot(), relativePath))
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null
  }
  return resolved
}

function dataRoot(): string {
  return path.resolve(path.join(process.cwd(), "data"))
}
