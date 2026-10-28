import fs from "node:fs"
import path from "node:path"

import sharp from "sharp"

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
const TARGET_BYTES = 100 * 1024

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
  const original = Buffer.from(await file.arrayBuffer())
  if (!matchesMagic(typed, original)) {
    throw new Error("mime")
  }
  const bytes = await compressWebp(original)
  return { mime: "image/webp", ext: "webp", bytes }
}

async function compressWebp(input: Buffer): Promise<Buffer> {
  let width = 1280
  let quality = 76
  let output = await encodeWebp(input, width, quality)
  while (output.length > TARGET_BYTES && quality > 36) {
    quality -= 8
    output = await encodeWebp(input, width, quality)
  }
  while (output.length > TARGET_BYTES && width > 320) {
    width = Math.round(width * 0.75)
    output = await encodeWebp(input, width, quality)
  }
  return output
}

function encodeWebp(input: Buffer, width: number, quality: number): Promise<Buffer> {
  return sharp(input, { animated: false, failOn: "none" })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 4 })
    .toBuffer()
}

const PREVIEW_WIDTH = 32
const PREVIEW_QUALITY = 20

export async function writePreview(id: string, source: Buffer): Promise<void> {
  const bytes = await sharp(source, { animated: false, failOn: "none" })
    .rotate()
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .webp({ quality: PREVIEW_QUALITY, effort: 4 })
    .toBuffer()
  const root = path.resolve(uploadsDir())
  fs.mkdirSync(root, { recursive: true })
  const target = path.join(root, `${id}.preview.webp`)
  fs.writeFileSync(target, bytes)
}

export async function previewDataUrl(id: string): Promise<string | null> {
  const root = path.resolve(uploadsDir())
  const preview = path.join(root, `${id}.preview.webp`)
  if (!fs.existsSync(preview)) {
    const full = path.join(root, `${id}.webp`)
    if (!fs.existsSync(full)) {
      return null
    }
    await writePreview(id, fs.readFileSync(full))
  }
  if (!fs.existsSync(preview)) {
    return null
  }
  return `data:image/webp;base64,${fs.readFileSync(preview).toString("base64")}`
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
  if (resolved.endsWith(".webp")) {
    const preview = resolved.slice(0, -".webp".length) + ".preview.webp"
    try {
      fs.unlinkSync(preview)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to delete upload preview")
      }
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
