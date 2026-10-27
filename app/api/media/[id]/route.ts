import { createReadStream, statSync } from "node:fs"
import { Readable } from "node:stream"

import { getDb } from "@/lib/db"
import { ApiError, handle } from "@/lib/errors"
import { resolveUpload } from "@/lib/files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

export function GET(_request: Request, context: Context) {
  return handle(async () => {
    const { id } = await context.params
    const row = getDb().prepare("SELECT path, mime FROM media WHERE id = ?").get(id) as
      | { path: string; mime: string }
      | undefined
    if (!row) {
      throw new ApiError("not_found", 404)
    }
    const resolved = resolveUpload(row.path)
    if (!resolved) {
      throw new ApiError("not_found", 404)
    }
    try {
      if (!statSync(resolved).isFile()) {
        throw new ApiError("not_found", 404)
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error
      }
      throw new ApiError("not_found", 404)
    }
    const stream = Readable.toWeb(createReadStream(resolved)) as ReadableStream
    return new Response(stream, {
      headers: {
        "Content-Type": row.mime,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    })
  })
}
